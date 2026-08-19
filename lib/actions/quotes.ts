'use server'

import { z } from 'zod'
import { createSafeActionClient } from 'next-safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateTierDescriptions } from '@/lib/ai/tier-descriptions'
import { sendBookingConfirmAlimtalk } from '@/lib/kakao/alimtalk'
import { sendQuoteToCustomer } from '@/lib/kakao/quote-delivery'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { isBusinessService } from '@/lib/utils'
import { findCustomerIdByPhone } from '@/lib/actions/_customer-lookup'
import { inputToUtcIso } from '@/lib/format/datetime'
import { normalizeChannel } from '@/lib/utils/marketing-channels'
import { parseVolumeTiers, unitPriceForSize, volumeRatioForSize } from '@/lib/quote/volume-tiers'

// 공개 폼용 액션 클라이언트 (인증 불필요)
const publicAction = createSafeActionClient({
  handleServerError(e) {
    if (e.message.startsWith('[APP]')) return e.message.replace('[APP] ', '')
    console.error('[PublicAction Error]', e)
    return '잠시 문제가 있었어요. 잠시 후 다시 시도해주세요'
  },
}).use(async ({ next }) => {
  const result = await next()
  // 입력값이 스키마에 걸려 거부된 요청은 '예외'가 아니라 조용히 반환돼 아무 기록도 남지 않는다.
  // 그래서 공개 견적폼이 튕겨도 사장님 눈엔 '문의가 안 들어온다'로만 보인다.
  // (700평 요청이 상한 300평에 막혔던 건을 며칠 뒤에야 알았다 — 2026-08-17)
  // 값은 남기지 않는다: 고객 이름·연락처가 로그에 쌓이지 않도록 '어느 칸이 왜 걸렸는지'만 기록.
  if (result.validationErrors) {
    console.error('[공개폼 입력 거부]', JSON.stringify(result.validationErrors))
  }
  return result
})

// 한국 전화번호 검증
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

// 기본 quote_tiers fallback (업체가 tiers를 아직 설정하지 않은 경우)
const DEFAULT_TIERS = [
  { tier: 'good',   label: '기본',     price_multiplier: 1.0, highlight: false },
  { tier: 'better', label: '추천',     price_multiplier: 1.2, highlight: true },
  { tier: 'best',   label: '프리미엄', price_multiplier: 1.5, highlight: false },
] as const

// Step 1: 가격 계산 + 견적 생성
const calculateAndCreateQuoteSchema = z.object({
  business_id: z.string().uuid('올바른 업체 정보가 아닙니다'),
  service_id: z.string().uuid('서비스를 선택해주세요'),
  // 평수(또는 에어컨 대수). 상한 300은 주거 기준이라 공장·물류창고·사무실 견적이 통째로 막혔다.
  // (다트클린에 700평 인테리어 후 청소 요청이 들어왔다가 폼에서 튕겨나간 적 있음 — 2026-08-17)
  // 상한은 봇이 터무니없는 금액을 만들지 못하게 막는 용도로만 남긴다.
  space_size: z.coerce
    .number()
    .min(1, '평수를 입력해주세요')
    .max(100000, '평수가 너무 커요. 숫자를 다시 확인해주세요')
    .optional(),
  preferred_date: z.string().max(30).optional(),
  extra_notes: z.string().max(500).optional(),
  // 공개 폼이라 이름·연락처는 선택(가격만 보고 갈 수도 있음)이지만, 값이 있으면 형식을 검증한다 —
  // 아무 번호나 통과하면 그 번호로 알림톡이 잘못 발송되고(제3자 스팸·Solapi 비용) 견적 목록도 오염됨.
  customer_name: z.string().max(50).optional(),
  customer_phone: z
    .string()
    .max(20)
    .optional()
    .transform((v) => v?.replace(/-/g, '') || undefined)
    .refine((v) => !v || phoneRegex.test(v), '올바른 전화번호 형식이 아닙니다'),
  company_name: z.string().max(100).optional(), // B2B 서비스에서 고객이 입력한 회사명
  // 에어컨 유형별 선택 수량 { wall_standard: 2, stand_standard: 1 }
  // — 봇이 비정상 수량으로 터무니없는 금액을 만들지 않도록 정수·상한을 둔다
  ac_selections: z.record(z.string(), z.number().int().min(0).max(1000)).optional(),
  // 항목별 선택 수량 { "화장실": 2, "주방": 1 }
  unit_selections: z.record(z.string(), z.number().int().min(0).max(1000)).optional(),
  // 구분 선택 (신축/구축 등) — unit_variants가 있는 서비스에만 전달
  unit_variant: z.string().max(50).optional(),
  // 유입 채널(?ch=) — 어느 홍보 채널에서 온 견적인지 오더에 도장 찍기용
  channel: z.string().max(50).optional(),
})

export const calculateAndCreateQuoteAction = publicAction
  .schema(calculateAndCreateQuoteSchema)
  .action(async ({ parsedInput }) => {
    const db = createServiceClient()

    // 업체 존재 확인 (대표 전화번호도 함께 — 본인 테스트 견적 자동 감지용)
    const { data: business } = await db
      .from('businesses')
      .select('id, phone')
      .eq('id', parsedInput.business_id)
      .maybeSingle()

    if (!business) throw new Error('[APP] 존재하지 않는 업체입니다')

    // 사장님 본인 번호로 들어온 견적은 테스트로 보고 통계에서 자동 제외
    const onlyDigits = (p: string | null | undefined) => (p ?? '').replace(/[^0-9]/g, '')
    const bizPhoneDigits = onlyDigits((business as { phone?: string | null }).phone)
    const custPhoneDigits = onlyDigits(parsedInput.customer_phone)
    const isTestQuote = bizPhoneDigits.length > 0 && custPhoneDigits === bizPhoneDigits

    // 선택한 서비스 조회 (에어컨·항목별 단가 포함)
    const { data: service } = await db
      .from('service_items')
      .select('id, name, base_price, unit, ac_type_prices, unit_prices, unit_variants, volume_tiers, tier_good_items, tier_better_items, tier_best_items, tier_good_price, tier_better_price, tier_best_price, tier_good_discount_rate, tier_good_discount_amount, tier_better_discount_rate, tier_better_discount_amount, tier_best_discount_rate, tier_best_discount_amount' as never)
      .eq('id', parsedInput.service_id)
      .eq('business_id', parsedInput.business_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle() as unknown as { data: {
        id: string; name: string; base_price: number; unit: string
        ac_type_prices: unknown; unit_prices: unknown; unit_variants: unknown; volume_tiers?: unknown
        tier_good_items?: string[] | null; tier_better_items?: string[] | null; tier_best_items?: string[] | null
        tier_good_price?: number | null; tier_better_price?: number | null; tier_best_price?: number | null
        tier_good_discount_rate?: number | null;   tier_good_discount_amount?: number | null
        tier_better_discount_rate?: number | null; tier_better_discount_amount?: number | null
        tier_best_discount_rate?: number | null;   tier_best_discount_amount?: number | null
      } | null }

    if (!service) throw new Error('[APP] 선택한 서비스를 찾을 수 없습니다')

    // 규모 구간별 단가 — 평수(개수)가 크면 업체가 설정해둔 낮은 단가를 적용한다.
    // 구간을 설정하지 않은 업체는 tiers가 빈 배열이라 기본가 그대로 계산된다(기존 동작 유지).
    const volumeTiers = parseVolumeTiers(service.volume_tiers)
    const effectiveUnitPrice = unitPriceForSize(service.base_price, volumeTiers, parsedInput.space_size)

    // 기본 금액 계산
    let baseCalc: number
    if (
      parsedInput.ac_selections &&
      service.ac_type_prices &&
      typeof service.ac_type_prices === 'object' &&
      !Array.isArray(service.ac_type_prices)
    ) {
      // 에어컨 유형별 단가 × 대수 합산
      const prices = service.ac_type_prices as Record<string, number>
      baseCalc = Object.entries(parsedInput.ac_selections).reduce((sum, [typeId, count]) => {
        const unitPrice = prices[typeId] ?? service.base_price
        return sum + unitPrice * count
      }, 0)
    } else if (
      parsedInput.unit_selections &&
      service.unit_prices &&
      Array.isArray(service.unit_prices)
    ) {
      // 항목별 단가 × 수량 합산 (줄눌·화장실청소 등)
      // unit_variant가 지정된 경우 해당 구분의 단가만 사용
      type UnitPriceItem = { name: string; price: number; variant?: string }
      const allItems = service.unit_prices as UnitPriceItem[]
      const variant = parsedInput.unit_variant
      const items = variant
        ? allItems.filter((item) => item.variant === variant)
        : allItems.filter((item) => !item.variant)
      baseCalc = items.reduce((sum, item) => {
        const count = parsedInput.unit_selections![item.name] ?? 0
        return sum + item.price * count
      }, 0)
    } else if (service.unit === '평당') {
      baseCalc = effectiveUnitPrice * (parsedInput.space_size || 1)
    } else if (service.unit === '개') {
      baseCalc = effectiveUnitPrice * (parsedInput.space_size || 1)
    } else {
      baseCalc = service.base_price
    }

    // 플랜 이름·배수는 코드 상수 하나로 고정한다(2026-08-19).
    // 예전엔 업체마다 quote_tiers 행을 두고 설정 화면(/dashboard/tiers)에서 고치게 했는데,
    // 정작 고객이 보는 견적서는 '기본/추천/프리미엄'을 코드에 박아 쓰고 있어서
    // 무엇을 바꿔도 화면이 안 바뀌었다. 비테크 사장님에게 아무 일도 안 하는 설정은 짐이다.
    const tiers = DEFAULT_TIERS
    const roundToThousand = (n: number) => Math.round(n / 1000) * 1000

    // 서비스별 플랜 할인 (컬럼이 아직 없으면 0 — 마이그레이션 적용 전 안전)
    const tierDiscount: Record<'good' | 'better' | 'best', { rate: number; amount: number }> = {
      good:   { rate: Number(service.tier_good_discount_rate)   || 0, amount: Number(service.tier_good_discount_amount)   || 0 },
      better: { rate: Number(service.tier_better_discount_rate) || 0, amount: Number(service.tier_better_discount_amount) || 0 },
      best:   { rate: Number(service.tier_best_discount_rate)   || 0, amount: Number(service.tier_best_discount_amount)   || 0 },
    }
    // 자동 계산된 가격에 할인 적용: 가격 × (1 - 할인율/100) - 할인액, 0 미만 방지
    const applyDiscount = (price: number, tierKey: 'good' | 'better' | 'best') => {
      const d = tierDiscount[tierKey]
      if (d.rate === 0 && d.amount === 0) return price
      const discounted = price * (1 - d.rate / 100) - d.amount
      return Math.max(0, roundToThousand(discounted))
    }

    // 이 서비스에 3단계 플랜이 설정됐는지 — 미설정이면 단일 금액으로 안내한다.
    // 판단 기준은 서비스 자체의 플랜 구성뿐이다(포함 항목 tier_*_items · 직접 가격 tier_*_price).
    // 예전엔 quote_tier_services(플랜별 서비스 묶음)도 함께 봤는데, 그 화면을 없애면서
    // 함께 걷어냈다 — 전 업체 통틀어 한 건도 쓰지 않던 경로였다.
    const plansConfigured =
      (service.tier_good_items?.length   ?? 0) > 0 ||
      (service.tier_better_items?.length ?? 0) > 0 ||
      (service.tier_best_items?.length   ?? 0) > 0 ||
      service.tier_good_price   != null ||
      service.tier_better_price != null ||
      service.tier_best_price   != null

    // DEFAULT_TIERS 상수라 항상 찾아진다
    const goodTier   = tiers.find((t) => t.tier === 'good')!
    const betterTier = tiers.find((t) => t.tier === 'better')!
    const bestTier   = tiers.find((t) => t.tier === 'best')!

    let goodPrice: number
    let betterPrice: number | null
    let bestPrice: number | null
    let goodNames: string[] = []
    let betterNames: string[] = []
    let bestNames: string[] = []

    if (!plansConfigured) {
      // 플랜 미설정 — 선택한 서비스의 계산 금액 그대로 (추천 플랜 없음)
      goodPrice = applyDiscount(roundToThousand(baseCalc), 'good')
      betterPrice = null
      bestPrice = null
    } else {
      // 서비스별 직접 가격(tier_*_price)이 있으면 그 값 우선, 없으면 기본가 × 배수.
      // 직접 가격은 원/평(평당) 또는 정액 단가이므로 평당이면 평수만큼 곱한다.
      // 플랜 직접 가격에도 규모 구간 비율을 함께 적용한다 — 안 그러면 큰 건에서
      // 기본 금액만 내려가고 추천·프리미엄은 그대로라 플랜 순서가 뒤집힌다.
      const sizeMult = service.unit === '평당' ? (parsedInput.space_size || 1) : 1
      const volumeRatio = volumeRatioForSize(service.base_price, volumeTiers, parsedInput.space_size)
      const tierByPriceOrMult = (override: number | null | undefined, mult: number) =>
        override != null && override > 0
          ? roundToThousand(override * volumeRatio * sizeMult)
          : roundToThousand(baseCalc * mult)

      goodPrice   = applyDiscount(tierByPriceOrMult(service.tier_good_price,   goodTier.price_multiplier),   'good')
      betterPrice = applyDiscount(tierByPriceOrMult(service.tier_better_price, betterTier.price_multiplier), 'better')
      bestPrice   = applyDiscount(tierByPriceOrMult(service.tier_best_price,   bestTier.price_multiplier),   'best')

      // AI 설명에 전달할 플랜별 포함 항목 — 서비스 편집에서 적은 그대로
      goodNames   = service.tier_good_items   ?? []
      betterNames = service.tier_better_items ?? []
      bestNames   = service.tier_best_items   ?? []
    }

    // B2B 서비스에서 받은 회사명은 quotes에 전용 컬럼이 없어 메모(extra_notes) 앞에 기록 —
    // 대표가 견적 목록·상세에서 어느 회사 문의인지 바로 알 수 있게 한다.
    const companyInput = parsedInput.company_name?.trim()
    const mergedExtraNotes = [
      companyInput ? `[회사명] ${companyInput}` : null,
      parsedInput.extra_notes?.trim() || null,
    ].filter(Boolean).join('\n') || null

    // 견적 생성
    const { data: quote, error } = await db
      .from('quotes')
      .insert({
        business_id:   parsedInput.business_id,
        cleaning_type: service.name,
        space_size:    parsedInput.space_size ?? null,
        preferred_date: parsedInput.preferred_date ?? null,
        extra_notes:   mergedExtraNotes,
        good_price:    goodPrice,
        better_price:  betterPrice,
        best_price:    bestPrice,
        status:        'pending',
        customer_name:  parsedInput.customer_name || null,
        customer_phone: parsedInput.customer_phone || null,
        is_test:       isTestQuote,
        // 유입 채널 — 알려진 채널 키만 저장(임의값은 null로 걸러 통계 오염 방지)
        channel:       normalizeChannel(parsedInput.channel),
      } as never)
      .select('id')
      .single()

    if (error) throw new Error('[APP] 견적 생성에 실패했습니다')

    // AI 플랜 설명 생성 (실패해도 가격 카드는 정상 표시)
    let descriptions: { good: string[]; better: string[]; best: string[] } = {
      good: [], better: [], best: [],
    }
    try {
      descriptions = await generateTierDescriptions({
        serviceName: service.name,
        spaceSize: parsedInput.space_size,
        goodPrice,
        betterPrice: betterPrice ?? goodPrice,
        bestPrice: bestPrice ?? goodPrice,
        goodServices: goodNames,
        betterServices: betterNames,
        bestServices: bestNames,
      })
    } catch {
      console.error('[AI] tier descriptions 생성 실패')
    }

    // 연락처 있으면 견적 알림톡 발송 (실패해도 가격 카드 정상 표시)
    if (parsedInput.customer_phone && parsedInput.customer_name) {
      try {
        const { data: business } = await db
          .from('businesses')
          .select('name, phone, slug')
          .eq('id', parsedInput.business_id)
          .maybeSingle()

        if (business) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
          // 카카오 알림톡으로만 발송(문자 폴백 제거 — 발신번호 노출 방지). 미승인·실패 시 미발송.
          await sendQuoteToCustomer({
            customerPhone: parsedInput.customer_phone,
            customerName:  parsedInput.customer_name,
            businessName:  business.name,
            businessPhone: business.phone ?? null,
            cleaningType:  service.name,
            spaceSize:     parsedInput.space_size,
            preferredDate: parsedInput.preferred_date,
            goodPrice,
            betterPrice: betterPrice ?? goodPrice,
            bestPrice: bestPrice ?? goodPrice,
            quoteUrl: `${appUrl}/q/${parsedInput.business_id}/quote/${quote.id}`,
          })
        }
      } catch (e) {
        console.error('[Alimtalk] 견적 알림톡 발송 실패 — 가격 표시는 정상', e)
      }

      // 대표에게 앱 푸시 — "새 견적이 들어왔어요" (실패해도 견적 표시는 정상)
      // 알림 클릭 시 견적 대기 목록(개인 고객 탭)으로 바로 이동
      await sendPushToBusiness(parsedInput.business_id, {
        title: '새 견적이 들어왔어요! 🧾',
        body: `${companyInput ? `${companyInput}(${parsedInput.customer_name}님)` : `${parsedInput.customer_name}님`} · ${service.name}${parsedInput.space_size ? ` · ${parsedInput.space_size}평` : ''}`,
        url: '/dashboard/clients?type=individual',
        tag: `quote-${quote.id}`,
      })
    }

    // 클라이언트에 반환 (가격 카드 렌더링용)
    // 플랜 미설정이면 단일 금액 카드 하나만 반환 (가짜 추천 플랜 없음)
    const returnTiers = plansConfigured
      ? tiers.map((t) => ({
          tier: t.tier,
          label: t.label,
          price:
            t.tier === 'good'   ? goodPrice :
            t.tier === 'better' ? (betterPrice ?? goodPrice) :
            (bestPrice ?? goodPrice),
          highlight: t.highlight,
          descriptions: descriptions[t.tier as 'good' | 'better' | 'best'] ?? [],
        }))
      : [{
          tier: 'good',
          label: '견적 금액',
          price: goodPrice,
          highlight: false,
          descriptions: descriptions.good ?? [],
        }]

    return {
      quoteId: quote.id,
      tiers: returnTiers,
    }
  })


// Step 2: 예약 확정 (플랜 선택 + 개인정보 입력)
const createBookingSchema = z.object({
  quote_id: z.string().uuid('올바른 견적 정보가 아닙니다'),
  selected_tier: z.string().refine(
    (val): val is 'good' | 'better' | 'best' => ['good', 'better', 'best'].includes(val),
    '올바른 플랜을 선택해주세요'
  ),
  customer_name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  customer_phone: z
    .string()
    .min(1, '연락처를 입력해주세요')
    .transform((val) => val.replace(/-/g, ''))
    .refine((val) => phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다'),
  service_address: z.string().min(5, '주소를 입력해주세요'),
  // 청소 희망 날짜·시간 — 예전엔 안 받아서, 견적에 희망일이 없으면 '지금 이 순간'으로
  // 예약이 잡혔다(알림톡에 새벽 시각이 찍히고 일정 보드에도 오늘로 들어감).
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '청소 날짜를 골라주세요'),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/, '시간을 골라주세요').optional(),
})

export const createBookingAction = publicAction
  .schema(createBookingSchema)
  .action(async ({ parsedInput }) => {
    const db = createServiceClient()

    // 견적 조회 (pending 상태인지 확인) — 유입 채널(channel)도 함께 읽어 예약에 승계
    const { data: quote } = await db
      .from('quotes')
      .select('id, business_id, cleaning_type, good_price, better_price, best_price, preferred_date, status, channel' as never)
      .eq('id', parsedInput.quote_id)
      .maybeSingle() as unknown as {
        data: {
          id: string; business_id: string; cleaning_type: string
          good_price: number | null; better_price: number | null; best_price: number | null
          preferred_date: string | null; status: string; channel: string | null
        } | null
      }

    if (!quote) throw new Error('[APP] 견적 정보를 찾을 수 없습니다')
    if (quote.status !== 'pending') throw new Error('[APP] 이미 처리된 견적입니다')

    // 선택한 tier에 맞는 금액 추출
    const finalPrice =
      parsedInput.selected_tier === 'good'   ? (quote.good_price   ?? 0) :
      parsedInput.selected_tier === 'better' ? (quote.better_price ?? 0) :
      (quote.best_price ?? 0)

    // 예약 생성 — 고객이 확정 화면에서 고른 날짜·시간을 쓴다.
    // KST로 조립해야 한다: 'YYYY-MM-DD'를 그냥 new Date()에 넣으면 UTC 자정으로 읽혀
    // 한국 시간 오전 9시로 밀린다.
    const scheduledAt = inputToUtcIso(
      `${parsedInput.scheduled_date}T${parsedInput.scheduled_time ?? '09:00'}`
    )

    const { data: newBooking, error: bookingError } = await db.from('bookings').insert({
      business_id: quote.business_id,
      quote_id: quote.id,
      customer_name: parsedInput.customer_name,
      customer_phone: parsedInput.customer_phone,
      service_address: parsedInput.service_address,
      scheduled_at: scheduledAt,
      selected_tier: parsedInput.selected_tier,
      final_price: finalPrice,
      status: 'confirmed',
      // 견적의 유입 채널을 예약에 승계 — 매출을 채널까지 귀속
      channel: quote.channel ?? null,
    } as never).select('id').single()

    if (bookingError || !newBooking) throw new Error('[APP] 예약 생성에 실패했습니다')

    // 대표에게 앱 푸시 — "새 예약이 잡혔어요" (실패해도 예약 처리는 정상)
    // 알림 클릭 시 해당 예약 날짜의 일정으로 이동 + 예약 상세 시트 자동 오픈
    const bookingDate = scheduledAt.slice(0, 10) // UTC 날짜 (일정 보드도 UTC 기준 매칭)
    await sendPushToBusiness(quote.business_id, {
      title: '새 예약이 잡혔어요! 📅',
      body: `${parsedInput.customer_name}님 · ${quote.cleaning_type}`,
      url: `/dashboard/schedule?view=day&date=${bookingDate}&booking=${newBooking.id}`,
      tag: `booking-${newBooking.id}`,
    })

    // 견적 상태를 'booked'로 업데이트
    await db
      .from('quotes')
      .update({ status: 'booked' })
      .eq('id', quote.id)

    // 예약 확정 시 고객 DB 자동 등록 (전화번호 기준, 이미 있으면 재사용)
    // 숫자만으로 비교해 하이픈 형식 차이로 인한 고객 카드 중복을 막는다.
    if (parsedInput.customer_phone) {
      const existingId = await findCustomerIdByPhone(db, quote.business_id, parsedInput.customer_phone)

      if (!existingId) {
        await db.from('customers').insert({
          business_id: quote.business_id,
          name: parsedInput.customer_name,
          phone: parsedInput.customer_phone,
          address: parsedInput.service_address || null,
          type: 'one_time',
        })
      } else if (parsedInput.service_address) {
        // 이미 있는 고객이면 '비어 있는 칸만' 채운다.
        // 예전엔 통째로 건너뛰어서, 고객이 예약할 때마다 주소를 넣어도 고객 카드는
        // 계속 비어 있었다. 사장님이 정리해둔 주소는 덮지 않는다.
        const { data: existing } = await db
          .from('customers')
          .select('address')
          .eq('id', existingId)
          .maybeSingle()

        if (!existing?.address?.trim()) {
          await db
            .from('customers')
            .update({ address: parsedInput.service_address })
            .eq('id', existingId)
        }
      }
    }

    // 업체 정보 조회 (알림톡 발송용) — newBooking은 위 insert에서 이미 확보됨
    const { data: business } = await db
      .from('businesses')
      .select('name, phone')
      .eq('id', quote.business_id)
      .maybeSingle()

    // 카카오 알림톡 발송 — 퀄리오 단일 채널로 고객사 대신 발송 (실패해도 예약은 정상 완료)
    if (newBooking && business) {
      try {
        await sendBookingConfirmAlimtalk({
          customerPhone:  parsedInput.customer_phone,
          businessName:   business.name,
          businessPhone:  business.phone ?? null,
          cleaningType:   quote.cleaning_type ?? '청소 서비스',
          scheduledAt:    scheduledAt,
          serviceAddress: parsedInput.service_address,
          selectedTier:   parsedInput.selected_tier as 'good' | 'better' | 'best',
          finalPrice:     finalPrice,
          // 이 둘이 있어야 V2 템플릿('일정 변경 요청' 버튼 포함)으로 나간다.
          // 빠져 있어서 대표가 확정한 예약만 버튼 없는 V1로 발송되고 있었다.
          bookingId:      newBooking.id,
          businessId:     quote.business_id,
        })

        // 발송 성공 시 예약에 기록 — 사장님이 예약 상세에서 '보냈는지' 확인할 수 있게.
        // ⚠️ 예전엔 reports.kakao_sent_at 에 적었는데, 그 칸은 '작업 보고서 알림톡'
        //    발송 시각이다. 예약을 확정하는 순간 보고서를 보낸 걸로 기록돼서
        //    그 예약이 '알림톡 발송' 대기 목록에서 통째로 빠졌다. 되돌리지 말 것.
        await db
          .from('bookings')
          .update({ confirm_alimtalk_sent_at: new Date().toISOString() } as never)
          .eq('id', newBooking.id)

        console.log('[Alimtalk] 예약 확정 알림톡 발송 완료:', newBooking.id)
      } catch (e) {
        console.error('[Alimtalk] 알림톡 발송 실패 — 예약은 정상 완료됨', e)
      }
    }

    return { success: true }
  })

// ── 견적 보관/복원 액션 (인증 필요) ────────────────────────

import { action as authAction } from '@/lib/safe-action'

const quoteIdSchema = z.object({ quote_id: z.string().uuid() })

// 견적 보관 — pending/expired → archived (목록에서 숨김, DB는 유지)
export const archiveQuoteAction = authAction
  .schema(quoteIdSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    // 본인 업체 견적인지 확인
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('quotes')
      .update({ status: 'archived' })
      .eq('id', parsedInput.quote_id)
      .eq('business_id', profile.business_id)
      .in('status', ['pending', 'expired'])  // booked 견적은 보관 불가

    if (error) throw new Error('[APP] 보관 처리에 실패했습니다')

    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 견적 복원 — archived → pending (보관함에서 다시 활성화)
export const restoreQuoteAction = authAction
  .schema(quoteIdSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('quotes')
      .update({ status: 'pending' })
      .eq('id', parsedInput.quote_id)
      .eq('business_id', profile.business_id)
      .eq('status', 'archived')

    if (error) throw new Error('[APP] 복원에 실패했습니다')

    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 테스트/장난 견적을 통계에서 제외(is_test 토글) — 본인 테스트·고객 호기심 클릭 대비.
// is_test=true면 마케팅 통계·'예약확정 대기' 목록에서 빠진다(상태는 그대로).
export const markQuoteTestAction = authAction
  .schema(z.object({
    quote_id: z.string().min(1),
    is_test: z.boolean(),
  }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    // 본인 업체 견적인지 확인
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('quotes')
      .update({ is_test: parsedInput.is_test } as never)
      .eq('id', parsedInput.quote_id)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 처리에 실패했어요. 다시 눌러주세요')

    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 견적 취소 — pending → cancelled (전화해보니 고객이 안 한다고 할 때)
export const cancelQuoteAction = authAction
  .schema(quoteIdSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    // 본인 업체 견적인지 확인
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('quotes')
      .update({ status: 'cancelled' })
      .eq('id', parsedInput.quote_id)
      .eq('business_id', profile.business_id)
      .eq('status', 'pending')  // 아직 예약 확정 안 된 견적만 취소 가능

    if (error) throw new Error('[APP] 취소 처리에 실패했습니다')

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 취소한 견적 되살리기 — cancelled → pending (실수로 취소했거나 고객이 다시 하겠다고 할 때)
export const restoreCancelledQuoteAction = authAction
  .schema(quoteIdSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('quotes')
      .update({ status: 'pending' })
      .eq('id', parsedInput.quote_id)
      .eq('business_id', profile.business_id)
      .eq('status', 'cancelled')

    if (error) throw new Error('[APP] 되살리기에 실패했습니다')

    revalidatePath('/dashboard/clients')
    revalidatePath('/dashboard/work')
    return { success: true }
  })

// 견적 → 예약 확정 (업체가 직접 예약 생성) ─────────────────────────
const confirmBookingSchema = z.object({
  quote_id:        z.string().uuid(),
  scheduled_at:    z.string().min(1, '날짜를 선택해주세요'),
  selected_tier:   z.string().refine(
    (v) => ['good', 'better', 'best'].includes(v),
    '플랜을 선택해주세요'
  ),
  final_price:     z.coerce.number().min(0, '금액을 입력해주세요'),
  service_address: z.string().optional(),
})

export const confirmBookingFromQuoteAction = authAction
  .schema(confirmBookingSchema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()

    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 견적 조회 — 본인 업체, pending 상태만 허용 (유입 채널도 함께 읽어 예약에 승계)
    const { data: quote } = await db
      .from('quotes')
      .select('id, business_id, cleaning_type, customer_name, customer_phone, good_price, better_price, best_price, channel' as never)
      .eq('id', parsedInput.quote_id)
      .eq('business_id', profile.business_id)
      .eq('status', 'pending')
      .maybeSingle() as unknown as {
        data: {
          id: string; business_id: string; cleaning_type: string
          customer_name: string | null; customer_phone: string | null
          good_price: number | null; better_price: number | null; best_price: number | null
          channel: string | null
        } | null
      }

    if (!quote) throw new Error('[APP] 견적 정보를 찾을 수 없거나 이미 처리된 견적입니다')

    // 예약 생성 (알림톡·이력용으로 id 확보)
    const { data: newBooking, error: bookingError } = await db.from('bookings').insert({
      business_id:     quote.business_id,
      quote_id:        quote.id,
      customer_name:   quote.customer_name ?? '고객',
      customer_phone:  quote.customer_phone ?? '',
      service_address: parsedInput.service_address ?? '',
      scheduled_at:    inputToUtcIso(parsedInput.scheduled_at),
      selected_tier:   parsedInput.selected_tier,
      final_price:     parsedInput.final_price,
      status:          'confirmed',
      // 견적의 유입 채널을 예약에 승계 — 매출을 채널까지 귀속
      channel:         quote.channel ?? null,
    } as never).select('id').single() as unknown as { data: { id: string } | null; error: unknown }

    if (bookingError || !newBooking) throw new Error('[APP] 예약 생성에 실패했습니다')

    // 견적 상태 → booked
    await db
      .from('quotes')
      .update({ status: 'booked' })
      .eq('id', quote.id)

    // 예약 확정 시 고객 DB 자동 등록 (전화번호 기준, 이미 있으면 재사용)
    // 숫자만으로 비교해 하이픈 형식 차이로 인한 고객 카드 중복을 막는다.
    if (quote.customer_phone) {
      const existingId = await findCustomerIdByPhone(db, quote.business_id, quote.customer_phone)

      if (!existingId) {
        await db.from('customers').insert({
          business_id: quote.business_id,
          name: quote.customer_name ?? '고객',
          phone: quote.customer_phone,
          address: parsedInput.service_address || null,
          type: 'one_time',
        })
      } else if (parsedInput.service_address) {
        // 이미 있는 고객이면 비어 있는 주소만 채운다(사장님이 정리해둔 값은 덮지 않는다)
        const { data: existing } = await db
          .from('customers')
          .select('address')
          .eq('id', existingId)
          .maybeSingle()

        if (!existing?.address?.trim()) {
          await db
            .from('customers')
            .update({ address: parsedInput.service_address })
            .eq('id', existingId)
        }
      }
    }

    // 대시보드에서 예약 확정할 때도 고객에게 예약 확정 알림톡 발송
    // (기존엔 고객이 직접 예약할 때만 발송돼, 대표가 확정하면 고객이 확정 안내를 못 받던 문제)
    if (quote.customer_phone) {
      const { data: business } = await db
        .from('businesses')
        .select('name, phone')
        .eq('id', quote.business_id)
        .maybeSingle()

      if (business) {
        try {
          await sendBookingConfirmAlimtalk({
            customerPhone:  quote.customer_phone,
            businessName:   business.name,
            businessPhone:  business.phone ?? null,
            cleaningType:   quote.cleaning_type ?? '청소 서비스',
            scheduledAt:    inputToUtcIso(parsedInput.scheduled_at),
            serviceAddress: parsedInput.service_address ?? '',
            selectedTier:   parsedInput.selected_tier as 'good' | 'better' | 'best',
            finalPrice:     parsedInput.final_price,
            bookingId:      newBooking.id,
            businessId:     quote.business_id,
          })

          // ⚠️ reports.kakao_sent_at 이 아니라 예약에 기록한다(위 확정 경로와 같은 이유).
          await db
            .from('bookings')
            .update({ confirm_alimtalk_sent_at: new Date().toISOString() } as never)
            .eq('id', newBooking.id)
        } catch (e) {
          console.error('[Alimtalk] 예약 확정 알림톡 발송 실패 — 예약은 정상 완료됨', e)
        }
      }
    }

    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })

// 현장 견적(상담) 서비스 접수 — 고객이 견적폼에서 '상담' 단위 서비스를 고르면
// 가격 계산 대신 연락처를 받아 잠재고객(리드)으로 등록하고 대표에게 알림
const consultationRequestSchema = z.object({
  business_id:    z.string().uuid(),
  service_id:     z.string().uuid(),
  customer_name:  z.string().min(1).max(50),
  // 숫자만 남겨 한국 전화번호 형식을 검증 — 아무 번호나 리드로 쌓이고 대표 폰이 스팸 알림받는 것 방지
  customer_phone: z
    .string()
    .min(8)
    .max(20)
    .transform((v) => v.replace(/[^0-9]/g, ''))
    .refine((v) => phoneRegex.test(v), '올바른 전화번호 형식이 아닙니다'),
  company_name:   z.string().max(100).optional(), // B2B 서비스에서 고객이 입력한 회사명
  // 규모(평수·개수) — 가격을 안 넣은 서비스도 상담으로 접수되므로, 사장님이 다시 전화로
  // 묻지 않게 고객이 적은 규모를 그대로 들고 온다.
  space_size:     z.coerce.number().int().min(1).max(100000).optional(),
  notes:          z.string().max(500).optional(),
  // 유입 채널(?ch=) — 제안서 QR·전단지 QR 등 오프라인 영업 유입도 리드에 채널로 남긴다
  channel:        z.string().max(50).optional(),
})

export const createConsultationRequestAction = publicAction
  .schema(consultationRequestSchema)
  .action(async ({ parsedInput }) => {
    const db = createServiceClient()
    const channel = normalizeChannel(parsedInput.channel)

    const { data: service } = await db
      .from('service_items')
      .select('name, unit')
      .eq('id', parsedInput.service_id)
      .maybeSingle()
    const serviceName = service?.name ?? '상담 요청'

    const phone = parsedInput.customer_phone.replace(/[^0-9]/g, '')
    const name = parsedInput.customer_name.trim()
    const companyInput = parsedInput.company_name?.trim()
    const noteText = parsedInput.notes?.trim()
    // 규모 단위는 서비스 단위를 따른다(개수로 받는 서비스는 '개', 그 외는 '평')
    const sizeText = parsedInput.space_size
      ? `${parsedInput.space_size}${service?.unit === '개' ? '개' : '평'}`
      : ''
    const notes = `[현장견적 상담요청] ${serviceName}${sizeText ? ` · ${sizeText}` : ''}${noteText ? ` · ${noteText}` : ''}`

    // 정기청소·업무공간(사무실·상가·공장·병원 등) 문의는 사업자(법인)로 고정 —
    // 실측상 정기청소=100% 회사 고객이고, 업무공간 청소도 사실상 전부 법인 계약.
    // 그 외(에어컨·입주·이사 등 1회성 주거)는 개인으로 둠.
    const isBusinessCustomer = isBusinessService(serviceName)
    const customerType = isBusinessCustomer ? 'company' : 'individual'

    // 법인 리드는 회사명(company_name)·담당자(contact_name)를 나눠서 저장한다.
    // 고객이 회사명을 적었으면 그대로, 안 적었으면 담당자 이름으로 대체(기존 동작 유지).
    // 개인 고객은 예전처럼 company_name 자리에 이름을 넣고 담당자는 비운다.
    const leadCompanyName = isBusinessCustomer ? (companyInput || name) : name
    const leadContactName = isBusinessCustomer ? name : null

    // 같은 번호 리드가 있으면 갱신, 없으면 신규 (AI 상담 리드와 동일 규칙)
    const { data: existing } = await db
      .from('leads')
      .select('id, status, channel')
      .eq('business_id', parsedInput.business_id)
      .eq('phone', phone)
      .maybeSingle() as unknown as { data: { id: string; status: string; channel: string | null } | null }

    if (existing) {
      // 보관(archived)·거절(rejected)됐던 리드가 다시 문의하면 '신규 문의'로 되살림 —
      // 전엔 필요 없어 넘겼어도 마음이 바뀌어 재문의할 수 있어 보관함에 묻히면 안 됨.
      // 단, 이미 계약(contracted)됐거나 진행 중인 리드는 상태 유지.
      const isDormant = existing.status === 'archived' || existing.status === 'rejected'
      // 기존 리드가 정기청소·업무공간으로 문의하면 법인으로 승격(개인→법인만, 반대로 내리지 않음)
      await db
        .from('leads')
        .update({
          company_name: leadCompanyName,
          notes,
          updated_at: new Date().toISOString(),
          // 법인 문의면 담당자명도 함께 갱신(개인 문의는 담당자 칸 건드리지 않음)
          ...(isBusinessCustomer ? { customer_type: 'company', contact_name: leadContactName } : {}),
          ...(isDormant ? { status: 'new' } : {}),
          // 첫 유입 채널 유지(first-touch) — 이미 채널이 찍혀 있으면 덮어쓰지 않음
          ...(channel && !existing.channel ? { channel } : {}),
        } as never)
        .eq('id', existing.id)
    } else {
      await db.from('leads').insert({
        business_id:   parsedInput.business_id,
        company_name:  leadCompanyName,
        contact_name:  leadContactName,
        phone,
        customer_type: customerType,
        status:        'new',
        notes,
        channel,
      } as never)
    }

    // 대표 폰 알림 — 실패해도 접수는 유지
    try {
      await sendPushToBusiness(parsedInput.business_id, {
        title: '현장 견적 상담 요청! 📞',
        // 회사명이 있으면 "회사명(담당자님)"으로 표시해 대표가 누구인지 바로 알게 함
        body: `${isBusinessCustomer && companyInput ? `${companyInput}(${name}님)` : `${name}님`} · ${phone} · ${serviceName}${sizeText ? ` · ${sizeText}` : ''}`,
        url: '/dashboard/crm',
        tag: `consult-${phone}`,
      })
    } catch (e) {
      console.error('[Consult] 상담요청 알림 실패:', e)
    }

    return { success: true }
  })

// 고객이 카카오톡 '일정 변경 요청' 버튼으로 새 일정을 제안한다 ────────
//
// 바로 바꾸지 않고 '요청'으로만 받는다: 그 시간에 다른 현장이 잡혀 있을 수 있고
// 기사 배정도 함께 움직여야 한다. 고객이 일정표를 직접 바꾸면 사장님이 감당 못 한다.
const requestRescheduleSchema = z.object({
  booking_id:     z.string().uuid(),
  business_id:    z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '원하시는 날짜를 골라주세요'),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/, '시간을 골라주세요'),
  note:           z.string().max(300).optional(),
})

export const requestRescheduleAction = publicAction
  .schema(requestRescheduleSchema)
  .action(async ({ parsedInput }) => {
    const db = createServiceClient()

    const { data: booking } = await db
      .from('bookings')
      .select('id, customer_name, scheduled_at, status')
      .eq('id', parsedInput.booking_id)
      .eq('business_id', parsedInput.business_id)
      .maybeSingle()

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없어요')
    if (['completed', 'cancelled', 'no_show'].includes(booking.status as string)) {
      throw new Error('[APP] 이미 끝난 예약이라 변경할 수 없어요. 업체로 연락 부탁드려요')
    }

    const wantedAt = inputToUtcIso(`${parsedInput.scheduled_date}T${parsedInput.scheduled_time}`)

    const { error } = await db
      .from('bookings')
      .update({
        reschedule_requested_at:  new Date().toISOString(),
        reschedule_requested_for: wantedAt,
        reschedule_note:          parsedInput.note?.trim() || null,
      } as never)
      .eq('id', parsedInput.booking_id)

    if (error) throw new Error('[APP] 요청을 못 보냈어요. 다시 눌러주세요')

    // 사장님 폰으로 즉시 알림 — 고객은 답을 기다리는 중이라 늦으면 신뢰가 깨진다
    const whenLabel = new Date(wantedAt).toLocaleString('ko-KR', {
      month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Seoul',
    })
    const bookingDate = wantedAt.slice(0, 10)
    await sendPushToBusiness(parsedInput.business_id, {
      title: '고객이 일정 변경을 요청했어요 📅',
      body: `${booking.customer_name ?? '고객'}님 — ${whenLabel} 희망${parsedInput.note ? ` · "${parsedInput.note.slice(0, 30)}"` : ''}`,
      url: `/dashboard/schedule?view=day&date=${bookingDate}&booking=${parsedInput.booking_id}`,
      tag: `reschedule-${parsedInput.booking_id}`,
    })

    return { success: true }
  })
