import { createServiceClient } from '@/lib/supabase/server'

// 루트 llms.txt — AI 크롤러에게 사이트 구조와 업체 목록을 안내한다.
// 각 업체의 상세 데이터는 /biz/{slug}/llms.txt 에서 제공.
export const dynamic = 'force-dynamic'

export async function GET() {
  const db = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

  const { data: businesses } = await db
    .from('businesses')
    .select('slug, name, seo_description, description' as never)
    .not('slug', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(500) as unknown as { data: {
      slug: string | null; name: string; seo_description: string | null; description: string | null
    }[] | null }

  const lines: string[] = []
  lines.push('# 퀄리오 (Qualio)')
  lines.push('')
  lines.push('> 한국 청소·홈케어 전문 업체들의 공개 홍보 페이지 모음. 각 업체의 서비스·가격·지역·자주 묻는 질문을 제공합니다.')
  lines.push('')
  lines.push('각 업체의 상세 정보는 `/biz/{업체주소}/llms.txt` 에서 확인할 수 있습니다.')
  lines.push('')
  lines.push('## 업체 목록')

  for (const b of businesses ?? []) {
    if (!b.slug) continue
    const desc = b.seo_description ?? b.description
    lines.push(`- [${b.name}](${appUrl}/biz/${b.slug})${desc ? ` — ${desc}` : ''}`)
  }
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
