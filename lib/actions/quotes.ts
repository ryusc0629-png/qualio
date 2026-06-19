'use server'

import { z } from 'zod'
import { createSafeActionClient } from 'next-safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateTierDescriptions } from '@/lib/ai/tier-descriptions'
import { recommendBundles } from '@/lib/ai/bundle-recommendation'
import { sendBookingConfirmAlimtalk, sendQuoteAlimtalk } from '@/lib/kakao/alimtalk'
import { sendPushToBusiness } from '@/lib/push/web-push'

// 공개 폼용 액션 클라이언트 (인증 불필요)
const publicAction = createSafeActionClient({
  handleServerError(e) {
    if (e.message.startsWith('[APP]')) return e.message.replace('[APP] ', '')
    console.error('[PublicAction Error]', e)
    return '요청 처리 중 오류가 발생했습니다'
  },
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
  space_size: z.coerce.number().min(1).max(300).optional(),
  preferred_date: z.string().optional(),
  extra_notes: z.string().max(500).optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  // 에어컨 유형별 선택 수량 { wall_standard: 2, stand_standard: 1 }
  ac_selections: z.record(z.string(), z.number().min(0)).optional(),
  // 항목별 선택 수량 { "화장실": 2, "주방": 1 }
  unit_selections: z.record(z.string(), z.number().min(0)).optional(),
  // 구분 선택 (신축/구축 등) — unit_variants가 있는 서비스에만 전달
  unit_variant: z.string().optional(),
})

export const calculateAndCreateQuoteAction = publicAction
  .schema(calculateAndCreateQuoteSchema)
  .action(async ({ parsedInput }) => {
    const db = createServiceClient()

    // 업체 존재 확인
    const { data: business } = await db
      .from('businesses')
      .select('id')
      .eq('id', parsedInput.business_id)
      .maybeSingle()

    if (!business) throw new Error('[APP] 존재하지 않는 업체입니다')

    // 선택한 서비스 조회 (에어컨·항목별 단가 포함)
    const { data: service } = await db
      .from('service_items')
      .select('id, name, base_price, unit, ac_type_prices, unit_prices, unit_variants')
      .eq('id', parsedInput.service_id)
      .eq('business_id', parsedInput.business_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle()

    if (!service) throw new Error('[APP] 선택한 서비스를 찾을 수 없습니다')

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
      baseCalc = service.base_price * (parsedInput.space_size || 1)
    } else if (service.unit === '개') {
      baseCalc = service.base_price * (parsedInput.space_size || 1)
    } else {
      baseCalc = service.base_price
    }

    // 업체의 quote_tiers 조회
    const { data: dbTiers } = await db
      .from('quote_tiers')
      .select('id, tier, label, price_multiplier, highlight')
      .eq('business_id', parsedInput.business_id)
      .order('sort_order')

    const tiers = dbTiers && dbTiers.length > 0 ? dbTiers : DEFAULT_TIERS
    const roundToThousand = (n: number) => Math.round(n / 1000) * 1000

    // 업체의 전체 활성 서비스 목록 (AI 번들 추천용)
    const { data: allServices } = await db
      .from('service_items')
      .select('id, name, base_price, unit, category')
      .eq('business_id', parsedInput.business_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')

    // 번들 기반 가격 계산 (quote_tier_services 조회)
    const tierIds = tiers
      .filter((t): t is typeof t & { id: string } => 'id' in t && typeof t.id === 'string')
      .map((t) => t.id)

    let { data: tierServicesRows } = tierIds.length > 0
      ? await db
          .from('quote_tier_services')
          .select('tier_id, service_id')
          .in('tier_id', tierIds)
      : { data: [] }

    // 번들 미설정 시 AI가 자동으로 생성하고 DB에 저장 (캐시)
    const hasNoBundle = !tierServicesRows || tierServicesRows.length === 0
    if (hasNoBundle && allServices && allServices.length >= 2) {
      try {
        console.log('[AI] 번들 미설정 — AI 자동 번들 생성 시작')
        const recommendation = await recommendBundles(allServices)

        // service_name → service_id 변환용 맵
        const serviceIdMap: Record<string, string> = {}
        for (const s of allServices) serviceIdMap[s.id] = s.id

        // 각 tier에 AI 추천 서비스 저장
        const tierKeyMap: Record<string, string> = {}
        for (const t of tiers) {
          if ('id' in t) tierKeyMap[t.tier] = (t as { id: string }).id
        }

        const newRows: { tier_id: string; service_id: string; sort_order: number }[] = []
        const bundlePlan: Record<string, string[]> = {
          good: recommendation.good,
          better: recommendation.better,
          best: recommendation.best,
        }

        for (const [tierKey, svcIds] of Object.entries(bundlePlan)) {
          const tierId = tierKeyMap[tierKey]
          if (!tierId) continue
          svcIds.forEach((svcId, idx) => {
            // AI가 반환한 ID가 실제 서비스인지 검증
            if (allServices.some((s) => s.id === svcId)) {
              newRows.push({ tier_id: tierId, service_id: svcId, sort_order: idx })
            }
          })
        }

        if (newRows.length > 0) {
          await db.from('quote_tier_services').insert(newRows)
          tierServicesRows = newRows.map((r) => ({ tier_id: r.tier_id, service_id: r.service_id }))
          console.log('[AI] 번들 자동 생성 완료:', newRows.length, '개 연결')
        }
      } catch (e) {
        console.error('[AI] 번들 자동 생성 실패 — multiplier fallback 사용', e)
      }
    }

    // tier_id → service_ids 맵
    const bundleMap: Record<string, string[]> = {}
    for (const row of tierServicesRows ?? []) {
      if (!bundleMap[row.tier_id]) bundleMap[row.tier_id] = []
      bundleMap[row.tier_id].push(row.service_id)
    }

    // 번들 포함 서비스들의 합산 가격 계산
    const calcBundlePrice = async (tierId: string): Promise<number | null> => {
      const svcIds = bundleMap[tierId]
      if (!svcIds || svcIds.length === 0) return null

      const { data: svcItems } = await db
        .from('service_items')
        .select('id, base_price, unit')
        .in('id', svcIds)

      if (!svcItems) return null

      return roundToThousand(
        svcItems.reduce((sum, s) => {
          const price = s.unit === '평당'
            ? s.base_price * (parsedInput.space_size || 1)
            : s.base_price
          return sum + price
        }, 0)
      )
    }

    const goodTier   = tiers.find((t) => t.tier === 'good')
    const betterTier = tiers.find((t) => t.tier === 'better')
    const bestTier   = tiers.find((t) => t.tier === 'best')

    const goodId   = 'id' in (goodTier   ?? {}) ? (goodTier   as { id: string }).id : null
    const betterId = 'id' in (betterTier ?? {}) ? (betterTier as { id: string }).id : null
    const bestId   = 'id' in (bestTier   ?? {}) ? (bestTier   as { id: string }).id : null

    const [bundleGood, bundleBetter, bundleBest] = await Promise.all([
      goodId   ? calcBundlePrice(goodId)   : Promise.resolve(null),
      betterId ? calcBundlePrice(betterId) : Promise.resolve(null),
      bestId   ? calcBundlePrice(bestId)   : Promise.resolve(null),
    ])

    // 번들 가격 없으면 multiplier 방식 fallback
    const goodPrice   = bundleGood   ?? roundToThousand(baseCalc * Number(goodTier?.price_multiplier   ?? 1.0))
    const betterPrice = bundleBetter ?? roundToThousand(baseCalc * Number(betterTier?.price_multiplier ?? 1.2))
    const bestPrice   = bundleBest   ?? roundToThousand(baseCalc * Number(bestTier?.price_multiplier   ?? 1.5))

    // AI 설명에 전달할 번들 서비스 목록
    const getBundleServiceNames = async (tierId: string | null): Promise<string[]> => {
      if (!tierId) return []
      const svcIds = bundleMap[tierId]
      if (!svcIds || svcIds.length === 0) return []
      const { data } = await db.from('service_items').select('name').in('id', svcIds)
      return data?.map((s) => s.name) ?? []
    }

    const [goodNames, betterNames, bestNames] = await Promise.all([
      getBundleServiceNames(goodId),
      getBundleServiceNames(betterId),
      getBundleServiceNames(bestId),
    ])

    // 견적 생성
    const { data: quote, error } = await db
      .from('quotes')
      .insert({
        business_id:   parsedInput.business_id,
        cleaning_type: service.name,
        space_size:    parsedInput.space_size ?? null,
        preferred_date: parsedInput.preferred_date ?? null,
        extra_notes:   parsedInput.extra_notes ?? null,
        good_price:    goodPrice,
        better_price:  betterPrice,
        best_price:    bestPrice,
        status:        'pending',
        customer_name:  parsedInput.customer_name || null,
        customer_phone: parsedInput.customer_phone || null,
      })
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
        betterPrice,
        bestPrice,
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
          await sendQuoteAlimtalk({
            customerPhone: parsedInput.customer_phone,
            customerName:  parsedInput.customer_name,
            businessName:  business.name,
            businessPhone: business.phone ?? null,
            cleaningType:  service.name,
            spaceSize:     parsedInput.space_size,
            preferredDate: parsedInput.preferred_date,
            goodPrice,
            betterPrice,
            bestPrice,
            quoteUrl: `${appUrl}/q/${parsedInput.business_id}`,
          })
        }
      } catch (e) {
        console.error('[Alimtalk] 견적 알림톡 발송 실패 — 가격 표시는 정상', e)
      }

      // 대표에게 앱 푸시 — "새 견적이 들어왔어요" (실패해도 견적 표시는 정상)
      await sendPushToBusiness(parsedInput.business_id, {
        title: '새 견적이 들어왔어요! 🧾',
        body: `${parsedInput.customer_name}님 · ${service.name}${parsedInput.space_size ? ` · ${parsedInput.space_size}평` : ''}`,
        url: '/dashboard',
        tag: `quote-${quote.id}`,
      })
    }

    // 클라이언트에 반환 (가격 카드 렌더링용)
    return {
      quoteId: quote.id,
      tiers: tiers.map((t) => ({
        tier: t.tier,
        label: t.label,
        price:
          t.tier === 'good'   ? goodPrice :
          t.tier === 'better' ? betterPrice :
          bestPrice,
        highlight: t.highlight,
        descriptions: descriptions[t.tier as 'good' | 'better' | 'best'] ?? [],
      })),
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
})

export const createBookingAction = publicAction
  .schema(createBookingSchema)
  .action(async ({ parsedInput }) => {
    const db = createServiceClient()

    // 견적 조회 (pending 상태인지 확인)
    const { data: quote } = await db
      .from('quotes')
      .select('id, business_id, cleaning_type, good_price, better_price, best_price, preferred_date, status')
      .eq('id', parsedInput.quote_id)
      .maybeSingle()

    if (!quote) throw new Error('[APP] 견적 정보를 찾을 수 없습니다')
    if (quote.status !== 'pending') throw new Error('[APP] 이미 처리된 견적입니다')

    // 선택한 tier에 맞는 금액 추출
    const finalPrice =
      parsedInput.selected_tier === 'good'   ? (quote.good_price   ?? 0) :
      parsedInput.selected_tier === 'better' ? (quote.better_price ?? 0) :
      (quote.best_price ?? 0)

    // 예약 생성
    const scheduledAt = quote.preferred_date
      ? new Date(quote.preferred_date).toISOString()
      : new Date().toISOString()

    const { error: bookingError } = await db.from('bookings').insert({
      business_id: quote.business_id,
      quote_id: quote.id,
      customer_name: parsedInput.customer_name,
      customer_phone: parsedInput.customer_phone,
      service_address: parsedInput.service_address,
      scheduled_at: scheduledAt,
      selected_tier: parsedInput.selected_tier,
      final_price: finalPrice,
      status: 'confirmed',
    })

    if (bookingError) throw new Error('[APP] 예약 생성에 실패했습니다')

    // 대표에게 앱 푸시 — "새 예약이 잡혔어요" (실패해도 예약 처리는 정상)
    await sendPushToBusiness(quote.business_id, {
      title: '새 예약이 잡혔어요! 📅',
      body: `${parsedInput.customer_name}님 · ${quote.cleaning_type}`,
      url: '/dashboard',
      tag: `booking-${quote.id}`,
    })

    // 견적 상태를 'booked'로 업데이트
    await db
      .from('quotes')
      .update({ status: 'booked' })
      .eq('id', quote.id)

    // 예약 확정 시 고객 DB 자동 등록 (전화번호 기준, 이미 있으면 스킵)
    if (parsedInput.customer_phone) {
      const { data: existing } = await db
        .from('customers')
        .select('id')
        .eq('business_id', quote.business_id)
        .eq('phone', parsedInput.customer_phone)
        .maybeSingle()

      if (!existing) {
        await db.from('customers').insert({
          business_id: quote.business_id,
          name: parsedInput.customer_name,
          phone: parsedInput.customer_phone,
          address: parsedInput.service_address ?? null,
          type: 'one_time',
        })
      }
    }

    // 예약 ID 조회 (reports 저장 및 알림톡 발송용)
    const { data: newBooking } = await db
      .from('bookings')
      .select('id')
      .eq('quote_id', quote.id)
      .maybeSingle()

    // 업체 정보 조회 (알림톡 발송용)
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
        })

        // 발송 성공 시 reports 테이블에 기록
        await db.from('reports').insert({
          booking_id:    newBooking.id,
          business_id:   quote.business_id,
          kakao_sent_at: new Date().toISOString(),
        })

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

    // 견적 조회 — 본인 업체, pending 상태만 허용
    const { data: quote } = await db
      .from('quotes')
      .select('id, business_id, cleaning_type, customer_name, customer_phone, good_price, better_price, best_price')
      .eq('id', parsedInput.quote_id)
      .eq('business_id', profile.business_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (!quote) throw new Error('[APP] 견적 정보를 찾을 수 없거나 이미 처리된 견적입니다')

    // 예약 생성
    const { error: bookingError } = await db.from('bookings').insert({
      business_id:     quote.business_id,
      quote_id:        quote.id,
      customer_name:   quote.customer_name ?? '고객',
      customer_phone:  quote.customer_phone ?? '',
      service_address: parsedInput.service_address ?? '',
      scheduled_at:    new Date(parsedInput.scheduled_at).toISOString(),
      selected_tier:   parsedInput.selected_tier,
      final_price:     parsedInput.final_price,
      status:          'confirmed',
    })

    if (bookingError) throw new Error('[APP] 예약 생성에 실패했습니다')

    // 견적 상태 → booked
    await db
      .from('quotes')
      .update({ status: 'booked' })
      .eq('id', quote.id)

    // 예약 확정 시 고객 DB 자동 등록 (전화번호 기준, 이미 있으면 스킵)
    if (quote.customer_phone) {
      const { data: existing } = await db
        .from('customers')
        .select('id')
        .eq('business_id', quote.business_id)
        .eq('phone', quote.customer_phone)
        .maybeSingle()

      if (!existing) {
        await db.from('customers').insert({
          business_id: quote.business_id,
          name: quote.customer_name ?? '고객',
          phone: quote.customer_phone,
          address: parsedInput.service_address ?? null,
          type: 'one_time',
        })
      }
    }

    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/clients')
    return { success: true }
  })
