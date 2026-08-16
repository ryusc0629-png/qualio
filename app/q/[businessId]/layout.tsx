// 고객이 보는 /q 화면들(견적 문의·견적 제안·영수증·보고서)의 브라우저 탭 아이콘.
//
// 이 파일이 없으면 고객 폰의 탭·즐겨찾기에 퀄리오 아이콘이 뜬다.
// 고객에게는 '그 청소업체가 보낸 링크'여야 하므로 업체 아이콘으로 바꾼다.
// 우선순위는 홈페이지 파비콘(app/biz/[slug]/favicon/route.ts)과 동일 — 파비콘 → 로고.
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata(
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Metadata> {
  const { businessId: raw } = await params
  const idOrSlug = raw.normalize('NFC') // 한글 주소 NFC/NFD 불일치 매칭 실패 방지

  const db = createServiceClient()
  const column = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
  const { data: business } = await db
    .from('businesses')
    .select('name, logo_url, favicon_url' as never)
    .eq(column as never, idOrSlug as never)
    .maybeSingle() as unknown as { data: {
      name: string; logo_url: string | null; favicon_url: string | null
    } | null }

  // 업체를 못 찾거나 올린 아이콘이 없으면 기본(퀄리오) 아이콘을 그대로 둔다
  const icon = business?.favicon_url || business?.logo_url
  if (!icon) return {}

  return { icons: { icon, shortcut: icon, apple: icon } }
}

export default function PublicQuoteLayout({ children }: { children: React.ReactNode }) {
  return children
}
