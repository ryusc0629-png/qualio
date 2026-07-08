import type { createServiceClient } from '@/lib/supabase/server'
import { generateSocialContent } from './social-content'

type ServiceDb = ReturnType<typeof createServiceClient>

interface ChannelContentInput {
  businessName: string
  address: string | null
  geoTitle: string
  geoContent: string
  seoKeywords?: string[]  // 실검색량 기반 키워드(핵심+연관) — 네이버 태그에 우선 반영
}

// GEO 글을 바탕으로 네이버·당근·인스타 채널 텍스트를 생성해 biz_posts에 저장한다.
// 자동 발행(cron)·수동 발행(server action) 양쪽에서 동일하게 호출되는 공용 함수.
// 채널 텍스트 생성이 실패해도 GEO 발행 자체는 유지하되, 침묵하지 않고 에러를 로깅한다.
export async function generateAndSaveChannelContent(
  db: ServiceDb,
  postId: string,
  input: ChannelContentInput,
): Promise<boolean> {
  try {
    const c = await generateSocialContent(input)

    const { error } = await db
      .from('biz_posts')
      .update({
        naver_title:        c.naverTitle,
        naver_content:      c.naverContent,
        naver_tags:         c.naverTags,
        daangn_content:     c.daangn,
        instagram_content:  c.instagram,
        instagram_hashtags: c.instagramHashtags,
      })
      .eq('id', postId)

    if (error) {
      console.error(`[ChannelContent] DB 저장 실패 (post ${postId}):`, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error(
      `[ChannelContent] 채널 텍스트 생성 실패 (post ${postId}):`,
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
