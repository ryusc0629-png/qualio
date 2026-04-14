'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient } from '@/lib/supabase/server'

// 업체 등록 입력값 검증 스키마
const createBusinessSchema = z.object({
  name: z.string().min(2, '업체명은 2자 이상이어야 합니다'),
  phone: z.string().optional(),
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
        phone: parsedInput.phone ?? null,
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
