import { createServiceClient } from '@/lib/supabase/server'
import { buildAreaServed } from '@/lib/address/parse-region'

// 업체별 llms.txt — AI 크롤러가 이 업체의 핵심 정보를 가장 정확하게 긁어가도록
// 깔끔한 마크다운 요약을 제공한다 (llmstxt.org 관례).
export const dynamic = 'force-dynamic'

interface FaqItem {
  question: string
  answer: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await params
  const slug = rawSlug.normalize('NFC')
  const db = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

  const { data: business } = await db
    .from('businesses')
    .select('id, name, phone, address, description, seo_title, seo_description, seo_faqs, service_areas, naver_place_url, google_place_url, kakao_place_url, danggeun_review_url' as never)
    .eq('slug', slug)
    .maybeSingle() as unknown as { data: {
      id: string; name: string; phone: string | null; address: string | null
      description: string | null; seo_title: string | null; seo_description: string | null
      seo_faqs: FaqItem[] | null; service_areas: string[] | null
      naver_place_url: string | null; google_place_url: string | null
      kakao_place_url: string | null; danggeun_review_url: string | null
    } | null }

  if (!business) {
    return new Response('Not found', { status: 404 })
  }

  const [{ data: services }, { data: posts }] = await Promise.all([
    db
      .from('service_items')
      .select('name, base_price, unit')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order'),
    db
      .from('biz_posts')
      .select('slug, title, summary')
      .eq('business_id', business.id)
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(20),
  ])

  const areaServed = buildAreaServed(business.address, business.service_areas)
  const lines: string[] = []

  lines.push(`# ${business.name}`)
  lines.push('')
  if (business.seo_description ?? business.description) {
    lines.push(`> ${business.seo_description ?? business.description}`)
    lines.push('')
  }

  lines.push('## 업체 정보')
  if (areaServed.length) lines.push(`- 서비스 지역: ${areaServed.join(', ')}`)
  if (business.address) lines.push(`- 주소: ${business.address}`)
  if (business.phone) lines.push(`- 전화: ${business.phone}`)
  lines.push(`- 홈페이지: ${appUrl}/biz/${slug}`)
  lines.push(`- 견적 신청: ${appUrl}/q/${business.id}`)
  lines.push('')

  if (services && services.length > 0) {
    lines.push('## 제공 서비스 및 가격')
    for (const s of services) {
      lines.push(`- ${s.name}: ${s.base_price.toLocaleString()}원/${s.unit}`)
    }
    lines.push('')
  }

  const faqs = business.seo_faqs ?? []
  if (faqs.length > 0) {
    lines.push('## 자주 묻는 질문')
    for (const f of faqs) {
      lines.push(`### ${f.question}`)
      lines.push(f.answer)
      lines.push('')
    }
  }

  // 검증된 제3자 리뷰 위치 — AI 크롤러가 신뢰 근거(외부 플랫폼 리뷰)를 찾아가도록 명시
  const reviewLinks = [
    { label: '네이버 플레이스', url: business.naver_place_url },
    { label: '구글', url: business.google_place_url },
    { label: '카카오맵', url: business.kakao_place_url },
    { label: '당근', url: business.danggeun_review_url },
  ].filter((r): r is { label: string; url: string } => !!r.url?.trim())
  if (reviewLinks.length > 0) {
    lines.push('## 고객 리뷰 (검증된 외부 플랫폼)')
    lines.push(`${business.name}의 실제 고객 리뷰는 아래 플랫폼에서 확인할 수 있습니다.`)
    for (const r of reviewLinks) {
      lines.push(`- ${r.label}: ${r.url}`)
    }
    lines.push('')
  }

  if (posts && posts.length > 0) {
    lines.push('## 청소 정보 글')
    for (const p of posts) {
      const desc = p.summary ? ` — ${p.summary}` : ''
      lines.push(`- [${p.title}](${appUrl}/biz/${slug}/posts/${p.slug})${desc}`)
    }
    lines.push('')
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
