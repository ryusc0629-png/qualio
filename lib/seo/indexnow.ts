import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bizBaseUrl } from '@/lib/domains/resolve'

// IndexNow — 새 글이 발행되면 네이버·빙 등에 "이 URL 새로 생겼다"고 즉시 알려 색인을 앞당긴다.
// (구글은 IndexNow를 안 쓰지만 사이트맵+서치콘솔로 커버. 네이버/빙은 IndexNow 지원.)
// 키는 비밀이 아니며 public/<KEY>.txt 로도 공개돼 있어야 한다(소유 증명).
const INDEXNOW_KEY = '1c5b60cb44784531b64a1b74ac04ee4c'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr').replace(/\/$/, '')

// 발송 자체가 실패해도 발행 흐름은 막지 않는다 — 색인 알림은 부가 기능.
//
// ⚠️ IndexNow는 '보내는 주소'와 '키 파일이 놓인 주소'의 도메인이 같아야 받아준다.
// 고객사가 자체 도메인을 붙였으면 그 도메인 주소를 보내야 하고, 키 파일도 그 도메인에서
// 열려야 한다(프록시 matcher에서 키 파일을 제외해 두었다).
// 그래서 URL을 도메인별로 묶어 따로 보낸다 — 한 번에 섞어 보내면 통째로 거절된다.
export async function pingIndexNow(paths: string[]): Promise<void> {
  const urls = [...new Set(paths)].filter(Boolean).map((p) =>
    p.startsWith('http') ? p : `${APP_URL}${p.startsWith('/') ? '' : '/'}${p}`,
  )
  if (urls.length === 0) return

  const byHost = new Map<string, string[]>()
  for (const u of urls) {
    try {
      const { origin, host } = new URL(u)
      const key = `${origin}|${host}`
      byHost.set(key, [...(byHost.get(key) ?? []), u])
    } catch {
      // 주소 형식이 아니면 건너뛴다
    }
  }

  for (const [key, urlList] of byHost) {
    const [origin, host] = key.split('|')
    try {
      await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: INDEXNOW_KEY,
          keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
          urlList,
        }),
      })
    } catch (e) {
      console.error(`[IndexNow] 색인 알림 실패 (${host}):`, e)
    }
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
    .select('slug, custom_domain, custom_domain_status')
    .eq('id', businessId)
    .maybeSingle()

  const row = biz as { slug: string | null; custom_domain: string | null; custom_domain_status: string | null } | null
  if (!row?.slug) return // slug 없는 업체는 공개 페이지가 없으므로 스킵

  // 자체 도메인이 살아 있으면 그쪽이 정식 주소다 — 퀄리오 주소로 알리면 검색엔진이
  // 리다이렉트를 타고 가야 해서 색인이 늦고, 정작 그 도메인은 알림을 못 받는다.
  const base = bizBaseUrl(row)
  const paths = [
    `${base}`, // 업체 랜딩(새 글로 내용 갱신됨)
    ...slugs.map((s) => `${base}/posts/${s}`),
  ]
  await pingIndexNow(paths)
}
