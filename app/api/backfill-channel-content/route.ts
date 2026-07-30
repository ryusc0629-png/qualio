import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateAndSaveChannelContent } from '@/lib/ai/channel-content'

// 채널 원고(네이버·당근·인스타)가 누락된 기존 발행 글에 일괄로 원고를 보충하는 1회성 백필 API
// max_tokens 부족으로 과거에 채널 원고 생성이 실패해 누락된 글을 복구한다.
// CRON_SECRET 인증 필요 — 실행 후 삭제해도 무방
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  // 견적 CTA 링크의 절대주소 베이스 — auto-post와 동일하게 채널 원고 끝에 ?ch= 링크를 붙이기 위함
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

  // 채널 원고가 없는 발행 글 조회 — 포트폴리오(시공 사례) 제외, 네이버 원고가 비어 있는 것만
  const { data: posts } = await db
    .from('biz_posts' as never)
    .select('id, business_id, title, content, post_type, published, naver_content' as never)
    .eq('published' as never, true)
    .neq('post_type' as never, 'portfolio')
    .is('naver_content' as never, null) as unknown as {
      data: { id: string; business_id: string; title: string; content: string }[] | null
    }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ message: '보충할 글 없음', processed: 0 })
  }

  // 업체 정보(이름·주소)를 한 번에 모아 맵으로 — 글마다 재조회 방지
  const businessIds = [...new Set(posts.map((p) => p.business_id))]
  const { data: businesses } = await db
    .from('businesses' as never)
    .select('id, name, address, slug' as never)
    .in('id' as never, businessIds) as unknown as {
      data: { id: string; name: string; address: string | null; slug: string | null }[] | null
    }
  const bizMap = new Map((businesses ?? []).map((b) => [b.id, b]))

  let filled = 0
  let failed = 0

  for (const post of posts) {
    const biz = bizMap.get(post.business_id)
    if (!biz) {
      failed++
      continue
    }
    const ok = await generateAndSaveChannelContent(db, post.id, {
      businessName: biz.name,
      address: biz.address,
      geoTitle: post.title,
      geoContent: post.content,
      // 견적 CTA 링크는 슬러그(깔끔) 우선, 없으면 UUID 폴백 — auto-post와 동일. 없으면 CTA·링크가 통째로 누락됨
      quoteBaseUrl: `${appUrl}/q/${biz.slug ?? biz.id}`,
    })
    if (ok) {
      filled++
      console.log(`[Backfill] 채널 원고 생성: post=${post.id} — "${post.title}"`)
    } else {
      failed++
    }
  }

  return NextResponse.json({
    total: posts.length,
    filled,
    failed,
  })
}
