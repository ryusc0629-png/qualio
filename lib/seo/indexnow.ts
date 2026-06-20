import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// IndexNow — 새 글이 발행되면 네이버·빙 등에 "이 URL 새로 생겼다"고 즉시 알려 색인을 앞당긴다.
// (구글은 IndexNow를 안 쓰지만 사이트맵+서치콘솔로 커버. 네이버/빙은 IndexNow 지원.)
// 키는 비밀이 아니며 public/<KEY>.txt 로도 공개돼 있어야 한다(소유 증명).
const INDEXNOW_KEY = '1c5b60cb44784531b64a1b74ac04ee4c'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr').replace(/\/$/, '')

// 발송 자체가 실패해도 발행 흐름은 막지 않는다 — 색인 알림은 부가 기능.
export async function pingIndexNow(paths: string[]): Promise<void> {
  const urls = [...new Set(paths)].filter(Boolean).map((p) =>
    p.startsWith('http') ? p : `${APP_URL}${p.startsWith('/') ? '' : '/'}${p}`,
  )
  if (urls.length === 0) return

  try {
    const host = new URL(APP_URL).host
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${APP_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    })
  } catch (e) {
    console.error('[IndexNow] 색인 알림 실패:', e)
  }
}

// 특정 업체의 새 게시글들을 색인 알림 — 업체 slug를 찾아 글 URL + 업체 랜딩을 함께 핑.
export async function notifyIndexNowForPosts(
  db: SupabaseClient,
  businessId: string,
  postSlugs: string[],
): Promise<void> {
  const slugs = postSlugs.filter(Boolean)
  if (slugs.length === 0) return

  const { data: biz } = await db
    .from('businesses')
    .select('slug')
    .eq('id', businessId)
    .maybeSingle()

  const bizSlug = (biz as { slug: string | null } | null)?.slug
  if (!bizSlug) return // slug 없는 업체는 공개 페이지가 없으므로 스킵

  const paths = [
    `/biz/${bizSlug}`, // 업체 랜딩(새 글로 내용 갱신됨)
    ...slugs.map((s) => `/biz/${bizSlug}/posts/${s}`),
  ]
  await pingIndexNow(paths)
}
