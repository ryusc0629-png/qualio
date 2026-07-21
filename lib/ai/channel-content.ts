import type { createServiceClient } from '@/lib/supabase/server'
import { generateSocialContent } from './social-content'

type ServiceDb = ReturnType<typeof createServiceClient>

interface ChannelContentInput {
  businessName: string
  address: string | null
  geoTitle: string
  geoContent: string
  seoKeywords?: string[]  // 실검색량 기반 키워드(핵심+연관) — 네이버 태그에 우선 반영
  quoteBaseUrl?: string   // 견적 페이지 절대주소(예: https://qualio.co.kr/q/dartclean) — 채널별 ?ch= 링크 자동 삽입용
}

// 채널 원고 끝에 '견적 받기' 링크를 채널 태그(?ch=)와 함께 붙인다.
// 사장님이 네이버 블로그·당근에 복사해 올리면, 이 링크로 들어온 방문이 대시보드에서
// 네이버 블로그·당근으로 각각 집계됨(맨 URL 한 줄 — 두 채널 모두 붙여넣으면 자동 하이퍼링크).
// 마크다운 링크 문법 [텍스트](url)은 rich-text 변환기가 미지원하므로 쓰지 않는다.
// ctaQuestion: 글 주제 맞춤 유도 질문(예: "우리 에어컨 청소 비용은 얼마일까요?")
function appendQuoteCta(content: string, quoteBaseUrl: string, channel: string, ctaQuestion: string): string {
  const link = `${quoteBaseUrl}?ch=${channel}`
  return `${content.trimEnd()}\n\n${ctaQuestion}\n${link}`
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

    // 네이버 블로그·당근 원고 끝에 채널별 추적 링크(?ch=) 자동 삽입 — 유입 자동 집계.
    // 인스타는 캡션 링크가 클릭되지 않아 생략(태그·프로필 링크로만 유도).
    const naverContent = input.quoteBaseUrl
      ? appendQuoteCta(c.naverContent, input.quoteBaseUrl, 'naver_blog', c.ctaQuestion)
      : c.naverContent
    const daangnContent = input.quoteBaseUrl
      ? appendQuoteCta(c.daangn, input.quoteBaseUrl, 'danggeun', c.ctaQuestion)
      : c.daangn

    const { error } = await db
      .from('biz_posts')
      .update({
        naver_title:        c.naverTitle,
        naver_content:      naverContent,
        naver_tags:         c.naverTags,
        daangn_content:     daangnContent,
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
