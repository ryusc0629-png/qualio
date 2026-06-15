'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { testNaverBlogConnection } from '@/lib/naver/blog'
import { revalidatePath } from 'next/cache'

async function getBusinessId() {
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
  return { db, businessId: profile.business_id }
}

// 네이버 블로그 연동 저장 (저장 전 연결 테스트)
export const saveNaverBlogAction = action
  .schema(z.object({
    naver_blog_id:      z.string().min(1, '네이버 아이디를 입력해주세요'),
    naver_blog_api_key: z.string().min(1, 'API 키를 입력해주세요'),
  }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    // 연결 테스트 먼저 진행
    const test = await testNaverBlogConnection({
      blogId: parsedInput.naver_blog_id,
      apiKey:  parsedInput.naver_blog_api_key,
    })

    if (!test.success) {
      throw new Error(`[APP] 연동에 실패했어요. 아이디와 API 키를 다시 확인해주세요 (${test.error ?? ''})`)
    }

    const { error } = await db
      .from('businesses')
      .update({
        naver_blog_id:      parsedInput.naver_blog_id,
        naver_blog_api_key: parsedInput.naver_blog_api_key,
      })
      .eq('id', businessId)

    if (error) throw new Error('[APP] 저장에 실패했습니다')

    revalidatePath('/dashboard/settings')
    return { success: true }
  })

// 네이버 블로그 연동 해제
export const disconnectNaverBlogAction = action
  .schema(z.object({}))
  .action(async () => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('businesses')
      .update({
        naver_blog_id:      null,
        naver_blog_api_key: null,
      })
      .eq('id', businessId)

    if (error) throw new Error('[APP] 해제에 실패했습니다')

    revalidatePath('/dashboard/settings')
    return { success: true }
  })
