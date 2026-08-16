'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { getAdminBusinessIds, isAdminEmail } from '@/lib/admin/auth'
import { BETA_SEATS, BETA_LIFETIME_DISCOUNT_RATE } from '@/lib/config/beta'

// 한국 전화번호 검증: 하이픈 제거 후 010/011/02/031... 형식 확인
//
// 070(인터넷 전화)은 맨 뒤 `0[3-9]\d`에 걸려 통과한다 — 의도한 동작이다.
// 청소업체 중 070을 대표번호로 쓰는 곳이 실제로 있어서, 막으면 정상 업체가 가입에서 막힌다.
// (0503 같은 안심번호는 자릿수가 넘어 자연히 걸러진다)
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

// 가입 경로(자가응답) 채널 코드 — z.enum 금지 규칙에 따라 refine 사용
const ACQUISITION_SOURCES = ['youtube', 'search', 'referral', 'sns', 'community', 'etc']

// 가입 경로 코드 → 한글 라벨 (본사 알림 표시용 · 지표 대시보드와 동일 기준)
const ACQUISITION_LABELS: Record<string, string> = {
  youtube: '유튜브',
  search: '검색(네이버·구글)',
  referral: '지인 소개',
  sns: '인스타·SNS',
  community: '블로그·카페',
  etc: '기타',
}

// 업체 등록 입력값 검증 스키마
const createBusinessSchema = z.object({
  name: z.string().min(2, '업체명은 2자 이상이어야 합니다'),
  phone: z
    .string()
    .min(1, '전화번호를 입력해주세요')
    .transform((val) => val.replace(/-/g, ''))  // 하이픈 자동 제거
    .refine((val) => phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다'),
  // 가입 경로: 어떻게 알게 되셨나요 (필수)
  acquisitionSource: z
    .string()
    .refine((v) => ACQUISITION_SOURCES.includes(v), '가입 경로를 선택해주세요'),
  acquisitionDetail: z.string().max(100).optional(),      // '기타' 직접 입력
  acquisitionReferrer: z.string().max(500).optional(),    // best-effort
  acquisitionUtm: z.string().max(500).optional(),         // best-effort
})

// 업체 생성 액션
// - 사용자 인증은 일반 클라이언트로 검증
// - DB 쓰기 작업은 서비스 롤 클라이언트로 실행 (RLS 우회, 서버 전용)
// 순서: businesses 생성 → profiles.business_id 업데이트 → subscriptions 생성 → quote_tiers 생성
export const createBusinessAction = action
  .schema(createBusinessSchema)
  .action(async ({ parsedInput }) => {
    // 1. 인증 검증 (일반 클라이언트 — 사용자 세션 확인)
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    // 2. DB 작업은 서비스 롤 클라이언트 사용 (RLS 우회)
    const db = createServiceClient()

    // 중복 등록 방지: 이미 업체가 있으면 바로 성공 반환
    const { data: existing } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (existing?.business_id) return { success: true }

    // 프로필 행 보장 — 회원가입 트리거(handle_new_user)가 실패해 profiles 행이 없으면
    // businesses.owner_id FK(→ profiles.id) 위반으로 업체 생성 자체가 막혀 사용자가 온보딩에서 잠긴다.
    // (그러면 로그인할 때마다 다시 온보딩으로 돌아와 업체가 중복 생성되는 루프에 빠진다)
    // 이미 있으면 그대로 두고(full_name·business_id 보존), 없을 때만 생성한다.
    const fullName = (user.user_metadata as { full_name?: string } | null)?.full_name ?? ''
    await db
      .from('profiles')
      .upsert({ id: user.id, full_name: fullName }, { onConflict: 'id', ignoreDuplicates: true })

    // 3. 업체 생성 (가입 경로 함께 저장)
    // 이 사장님이 주인인 업체가 이미 있으면 새로 만들지 않고 재사용한다 —
    // 이전 온보딩이 업체 생성 후 프로필 연결(4단계) 전에 끊겼던 경우, 다시 시도할 때
    // 업체가 하나 더 생기던 중복을 막는다. (maybeSingle 대신 limit로 받아 이미 중복이 있어도 안전)
    const { data: ownedBusinesses } = await db
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)

    let businessId = ownedBusinesses?.[0]?.id ?? null
    // 이번 요청에서 '진짜 새로' 만든 경우만 true — 재시도로 기존 업체를 재사용하면 false(중복 알림 방지)
    let isNewBusiness = false

    if (!businessId) {
      // 새 컬럼(acquisition_*)은 마이그레이션 후 database.ts 타입이 갱신되므로 그 전까지 단언 처리
      const bizPayload = {
        owner_id: user.id,
        name: parsedInput.name,
        phone: parsedInput.phone,
        acquisition_source: parsedInput.acquisitionSource,
        acquisition_detail: parsedInput.acquisitionDetail || null,
        acquisition_referrer: parsedInput.acquisitionReferrer || null,
        acquisition_utm: parsedInput.acquisitionUtm || null,
      }
      const { data: business, error: bizError } = await db
        .from('businesses')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(bizPayload as any)
        .select('id')
        .single()

      if (bizError || !business) throw new Error('[APP] 업체 생성에 실패했습니다')
      businessId = business.id
      isNewBusiness = true
    }

    // 3-1. 베타 순번·평생 할인 부여 — 선착순 100팀 약속의 근거를 가입 시점에 확정한다.
    //      (정원이 차면 null이 돌아오고 할인 없이 그대로 진행 — 가입 자체를 막지 않는다)
    //      실패해도 가입은 계속돼야 하므로 try/catch로 감싼다.
    let betaNumber: number | null = null
    try {
      const { data: assigned } = await db.rpc('assign_beta_number' as never, {
        p_business_id: businessId,
        p_cap: BETA_SEATS,
        p_rate: BETA_LIFETIME_DISCOUNT_RATE,
      } as never)
      betaNumber = typeof assigned === 'number' ? assigned : null
    } catch (e) {
      console.error('[Onboarding] 베타 번호 부여 실패:', e)
    }

    // 4. 프로필에 업체 ID 연결
    const { error: profileError } = await db
      .from('profiles')
      .update({ business_id: businessId })
      .eq('id', user.id)

    if (profileError) throw new Error('[APP] 프로필 업데이트에 실패했습니다')

    // 5. beta 구독 플랜 생성 — 없을 때만 (재사용 업체엔 이미 있을 수 있어 중복 방지)
    const { data: existingSub } = await db
      .from('subscriptions')
      .select('id')
      .eq('business_id', businessId)
      .limit(1)

    if (!existingSub || existingSub.length === 0) {
      await db.from('subscriptions').insert({
        business_id: businessId,
        plan: 'beta',
        status: 'active',
      })
    }

    // 6. 기본 견적 3단계(Good/Better/Best) 자동 생성 — 없을 때만
    const { data: existingTiers } = await db
      .from('quote_tiers')
      .select('id')
      .eq('business_id', businessId)
      .limit(1)

    if (!existingTiers || existingTiers.length === 0) {
      await db.from('quote_tiers').insert([
        { business_id: businessId, tier: 'good',   label: '기본',     price_multiplier: 1.0, highlight: false, sort_order: 0 },
        { business_id: businessId, tier: 'better', label: '추천',     price_multiplier: 1.2, highlight: true,  sort_order: 1 },
        { business_id: businessId, tier: 'best',   label: '프리미엄', price_multiplier: 1.5, highlight: false, sort_order: 2 },
      ])
    }

    // 7. 신규 업체가 실제로 생성된 경우에만 본사(관리자) 폰에 즉시 알림
    //    — 재시도로 기존 업체를 재사용했거나, 관리자 본인이 만든 업체면 보내지 않는다.
    //    알림 발송 실패가 가입 자체를 막지 않도록 try/catch로 감싼다(부가 기능).
    if (isNewBusiness && !isAdminEmail(user.email)) {
      try {
        const sourceLabel = ACQUISITION_LABELS[parsedInput.acquisitionSource] ?? '경로 미상'
        // 베타 순번을 함께 보여주면 남은 자리를 따로 확인하지 않아도 진행 상황이 보인다
        const betaLabel = betaNumber ? ` · 베타 ${betaNumber}/${BETA_SEATS}번` : ''
        const adminBusinessIds = await getAdminBusinessIds()
        await Promise.all(
          adminBusinessIds.map((adminBusinessId) =>
            sendPushToBusiness(adminBusinessId, {
              title: '🎉 새 업체가 가입했어요',
              body: `${parsedInput.name} · ${sourceLabel}${betaLabel}`,
              url: '/admin/businesses',
              tag: 'new-signup',
            }),
          ),
        )
      } catch (e) {
        console.error('[Onboarding] 신규 가입 관리자 알림 실패:', e)
      }
    }

    return { success: true }
  })
