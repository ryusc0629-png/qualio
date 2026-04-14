'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'

// 한국 전화번호 검증: 하이픈 제거 후 010/011/02/031... 형식 확인
const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/

// 업체 등록 입력값 검증 스키마
const createBusinessSchema = z.object({
  name: z.string().min(2, '업체명은 2자 이상이어야 합니다'),
  phone: z
    .string()
    .min(1, '전화번호를 입력해주세요')
    .transform((val) => val.replace(/-/g, ''))   // 하이픈 자동 제거
    .refine((val) => phoneRegex.test(val), '올바른 전화번호 형식이 아닙니다'),
})

// 업체 생성 액션
// 1. businesses 테이블에 업체 생성
// 2. profiles.business_id 업데이트
// 3. subscriptions 테이블에 beta 플랜 등록
export const createBusinessAction = action
  .schema(createBusinessSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) throw new Error('로그인이 필요합니다')

    // 1. 업체 생성
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .insert({
        owner_id: user.id,
        name: parsedInput.name,
        phone: parsedInput.phone,  // 하이픈 제거된 숫자만 저장
      })
      .select('id')
      .single()

    if (bizError) throw new Error('업체 생성에 실패했습니다')

    // 2. 프로필에 업체 ID 연결
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ business_id: business.id })
      .eq('id', user.id)

    if (profileError) throw new Error('프로필 업데이트에 실패했습니다')

    // 3. beta 구독 플랜 생성
    await supabase.from('subscriptions').insert({
      business_id: business.id,
      plan: 'beta',
      status: 'active',
    })

    return { success: true }
  })
