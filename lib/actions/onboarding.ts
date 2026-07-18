'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 한국 전화번호 검증: 하이픈 제거 후 010/011/02/031... 형식 확인
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

// 가입 경로(자가응답) 채널 코드 — z.enum 금지 규칙에 따라 refine 사용
const ACQUISITION_SOURCES = ['youtube', 'search', 'referral', 'sns', 'community', 'etc']

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

    // 3. 업체 생성 (가입 경로 함께 저장)
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

    if (bizError) throw new Error('[APP] 업체 생성에 실패했습니다')

    // 4. 프로필에 업체 ID 연결
    const { error: profileError } = await db
      .from('profiles')
      .update({ business_id: business.id })
      .eq('id', user.id)

    if (profileError) throw new Error('[APP] 프로필 업데이트에 실패했습니다')

    // 5. beta 구독 플랜 생성
    await db.from('subscriptions').insert({
      business_id: business.id,
      plan: 'beta',
      status: 'active',
    })

    // 6. 기본 견적 3단계(Good/Better/Best) 자동 생성
    await db.from('quote_tiers').insert([
      { business_id: business.id, tier: 'good',   label: '기본',     price_multiplier: 1.0, highlight: false, sort_order: 0 },
      { business_id: business.id, tier: 'better', label: '추천',     price_multiplier: 1.2, highlight: true,  sort_order: 1 },
      { business_id: business.id, tier: 'best',   label: '프리미엄', price_multiplier: 1.5, highlight: false, sort_order: 2 },
    ])

    return { success: true }
  })
