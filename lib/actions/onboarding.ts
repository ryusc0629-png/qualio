'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 한국 전화번호 검증: 하이픈 제거 후 010/011/02/031... 형식 확인
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

// 업체 등록 입력값 검증 스키마
const createBusinessSchema = z.object({
  name: z.string().min(2, '업체명은 2자 이상이어야 합니다'),
  phone: z
    .string()
    .min(1, '전화번호를 입력해주세요')
    .transform((val) => val.replace(/-/g, ''))  // 하이픈 자동 제거
    .refine((val) => phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다'),
})

// 업체 생성 액션
// - 사용자 인증은 일반 클라이언트로 검증
// - DB 쓰기 작업은 서비스 롤 클라이언트로 실행 (RLS 우회, 서버 전용)
// 순서: businesses 생성 → profiles.business_id 업데이트 → subscriptions 생성
export const createBusinessAction = action
  .schema(createBusinessSchema)
  .action(async ({ parsedInput }) => {
    // 1. 인증 검증 (일반 클라이언트 — 사용자 세션 확인)
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) throw new Error('로그인이 필요합니다')

    // 2. DB 작업은 서비스 롤 클라이언트 사용 (RLS 우회)
    const db = createServiceClient()

    // 중복 등록 방지: 이미 업체가 있으면 바로 성공 반환
    const { data: existing } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()

    if (existing?.business_id) return { success: true }

    // 3. 업체 생성
    const { data: business, error: bizError } = await db
      .from('businesses')
      .insert({
        owner_id: user.id,
        name: parsedInput.name,
        phone: parsedInput.phone,
      })
      .select('id')
      .single()

    if (bizError) throw new Error('업체 생성에 실패했습니다')

    // 4. 프로필에 업체 ID 연결
    const { error: profileError } = await db
      .from('profiles')
      .update({ business_id: business.id })
      .eq('id', user.id)

    if (profileError) throw new Error('프로필 업데이트에 실패했습니다')

    // 5. beta 구독 플랜 생성
    await db.from('subscriptions').insert({
      business_id: business.id,
      plan: 'beta',
      status: 'active',
    })

    return { success: true }
  })
