// 고객사 홈페이지의 브라우저 탭 아이콘(파비콘).
//
// 이 라우트가 없으면 고객사 자체 도메인(dartclean.co.kr)에서도 퀄리오 아이콘이 뜬다.
// 브라우저·검색엔진이 자동으로 찾는 /favicon.ico 는 proxy가 여기로 넘긴다(proxy.ts).
//
// 우선순위: 업체가 올린 파비콘 → 로고 → 업체명 첫 글자로 만든 브랜드색 아이콘
import sharp from 'sharp'
import { createServiceClient } from '@/lib/supabase/server'
import { isDomainIdentifier } from '@/lib/domains/resolve'

// 탭 아이콘으로 내보낼 크기. 업체가 올린 원본(수천 픽셀·수백 KB)을 그대로 쓰면
// 브라우저가 눌러 그려 찌그러지고 무겁다.
// 96 = 48의 배수 — 구글은 검색 결과 파비콘으로 '정사각형, 48px보다 큰 것'을 요구한다.
const ICON_SIZE = 96

// 1시간 캐시 — 업체가 아이콘을 바꿨을 때 하루씩 옛 아이콘이 남지 않게 짧게 잡는다.
// (그 뒤 일주일은 낡은 것을 먼저 보여주고 뒤에서 새로 받아오므로 크롤러 부담은 없다)
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800'
const DEFAULT_BRAND_COLOR = '#059669'

/** 업체명 첫 글자로 만드는 대체 아이콘 — 최소한 퀄리오 로고 대신 그 업체 색이 보이게 한다 */
function fallbackIcon(name: string, color: string): Response {
  const letter = (name.trim()[0] ?? '·').replace(/[<>&"']/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="${color}"/>
  <text x="32" y="33" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
        font-size="36" font-weight="700" fill="#ffffff"
        text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>`
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': CACHE_CONTROL },
  })
}

/** 6자리 hex만 통과 — DB 값을 그대로 SVG에 넣지 않기 위한 방어 */
function safeColor(value: string | null): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_BRAND_COLOR
}

/**
 * 업체가 올린 이미지를 탭 아이콘 크기의 정사각형으로 다듬는다.
 *
 * 로고는 대부분 가로로 길고(다트클린 1381×1209) 용량도 크다(아찌클린 158KB).
 * 그대로 내보내면 탭에서 눌린 채로 작게 보인다. 그래서
 *  - 둘레의 '투명한' 여백만 잘라내 그림이 최대한 크게 차지하게 하고
 *  - 비율은 유지한 채 정사각형 안에 담는다(잘라내지 않으므로 로고가 짤리지 않는다)
 *  - 남는 자리는 투명으로 둔다(업체 브랜드 색을 임의로 칠하지 않기 위해)
 *
 * ⚠️ 자를 색을 지정하지 않으면 sharp가 '가장자리 색'을 기준으로 잘라낸다.
 * 그러면 빨간 배경에 글자를 얹은 정사각 아이콘 같은 경우 배경째 깎여나가
 * 업체가 만든 아이콘이 망가진다. 반드시 투명색만 대상으로 삼을 것.
 *
 * 어떤 이유로든 변환에 실패하면 null을 돌려주고 호출부가 원본을 그대로 내보낸다.
 */
async function toSquareIcon(input: Buffer): Promise<Buffer | null> {
  const fit = (img: sharp.Sharp) =>
    img
      .resize(ICON_SIZE, ICON_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()

  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

  try {
    // 여백 잘라내기는 온통 투명한 이미지 등에서 실패할 수 있어 따로 시도한다
    return await fit(sharp(input).trim({ background: TRANSPARENT }))
  } catch {
    try {
      return await fit(sharp(input))
    } catch (error) {
      console.error('[BizFavicon] 아이콘 이미지를 다듬지 못했습니다:', error)
      return null
    }
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = rawSlug.normalize('NFC') // 한글 주소 NFC/NFD 불일치 방지 (page.tsx와 동일)

  const db = createServiceClient()
  const column = isDomainIdentifier(slug) ? 'custom_domain' : 'slug'
  const { data: business } = await db
    .from('businesses')
    .select('name, logo_url, favicon_url, brand_color' as never)
    .eq(column as never, slug as never)
    .maybeSingle() as unknown as { data: {
      name: string; logo_url: string | null; favicon_url: string | null; brand_color: string | null
    } | null }

  if (!business) return new Response('Not found', { status: 404 })

  const color = safeColor(business.brand_color)
  const source = business.favicon_url || business.logo_url
  if (!source) return fallbackIcon(business.name, color)

  // 업로드된 이미지는 Supabase Storage에 있다. 리디렉트 대신 직접 넘겨줘야
  // 리디렉트를 따라가지 않는 크롤러(네이버·카카오 등)에서도 아이콘이 보인다.
  try {
    const upstream = await fetch(source, { cache: 'no-store' })
    if (!upstream.ok) return fallbackIcon(business.name, color)

    const original = Buffer.from(await upstream.arrayBuffer())
    const icon = await toSquareIcon(original)

    return new Response(new Uint8Array(icon ?? original), {
      headers: {
        'Content-Type': icon ? 'image/png' : upstream.headers.get('content-type') ?? 'image/png',
        'Cache-Control': CACHE_CONTROL,
      },
    })
  } catch (error) {
    console.error('[BizFavicon] 아이콘 이미지를 가져오지 못했습니다:', error)
    return fallbackIcon(business.name, color)
  }
}
