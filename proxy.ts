import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isPlatformHost, stripWww, getAppHost } from '@/lib/domains/host'

// 인증이 필요한 경로 (미로그인 시 /login으로 리디렉션)
const protectedRoutes = ['/dashboard', '/onboarding', '/new-password']

// 이미 로그인된 사용자가 접근하면 /dashboard로 리디렉션할 경로
const authRoutes = ['/login', '/signup']

// 고객사 자체 도메인에서는 '그 업체의 홈페이지'만 보여준다.
// 대시보드·로그인 등 퀄리오 서비스 화면은 항상 퀄리오 도메인으로 돌려보낸다.
// (세션 쿠키가 퀄리오 도메인에 묶여 있어 고객사 도메인에서는 로그인 자체가 성립하지 않는다)
const platformOnlyPrefixes = [
  '/dashboard', '/onboarding', '/login', '/signup', '/new-password',
  '/admin', '/upgrade', '/pricing', '/academy', '/ops',
  '/biz', // 고객사 도메인에서 /biz/... 직접 접근 = 같은 내용이 두 주소로 열림 → 한쪽으로 모은다
]

// 고객사 도메인에서 그대로 통과시킬 경로 (rewrite도 리디렉트도 하지 않음)
const passThroughPrefixes = ['/api', '/q', '/quote', '/review', '/_next', '/monitoring']

/**
 * 고객사 자체 도메인 요청 처리.
 * bkclean.co.kr/posts/xxx → 내부적으로 /biz/bkclean.co.kr/posts/xxx 를 렌더한다.
 * (호스트로 업체를 찾는 일은 페이지에서 하고, 여기서는 DB를 보지 않는다 — 모든 요청이 지나는 길목이라 느려지면 안 된다)
 */
function handleCustomDomain(request: NextRequest, host: string): NextResponse {
  const { pathname, search } = request.nextUrl
  const appOrigin = `https://${getAppHost()}`

  if (passThroughPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  // 브라우저·검색엔진이 자동으로 찾는 /favicon.ico → 그 업체 아이콘으로.
  // (이 처리가 없으면 고객사 도메인에서도 퀄리오 아이콘이 그대로 나간다)
  if (pathname === '/favicon.ico') {
    const url = request.nextUrl.clone()
    url.pathname = `/biz/${stripWww(host)}/favicon`
    return NextResponse.rewrite(url)
  }

  if (platformOnlyPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(`${appOrigin}${pathname}${search}`, 308)
  }

  // sitemap.xml / robots.txt 는 아래 matcher에서 제외돼 여기까지 오지 않는다.
  // 두 라우트가 각자 요청 호스트를 보고 분기한다(app/sitemap.ts, app/robots.ts).

  const domainKey = stripWww(host)
  const url = request.nextUrl.clone()
  url.pathname = `/biz/${domainKey}${pathname === '/' ? '' : pathname}`
  return NextResponse.rewrite(url)
}

export async function proxy(request: NextRequest) {
  // ── 고객사 자체 도메인 ── 인증 검사(Supabase 왕복) 전에 갈라진다. 공개 페이지라 세션이 필요 없다.
  const host = request.headers.get('host')
  if (!isPlatformHost(host)) {
    return handleCustomDomain(request, host!.toLowerCase().split(':')[0])
  }

  // 퀄리오 도메인의 파비콘은 정적 파일(app/favicon.ico) 그대로 —
  // 아이콘 요청까지 세션 확인(Supabase 왕복)을 하지 않도록 여기서 끝낸다.
  if (request.nextUrl.pathname === '/favicon.ico') return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 요청 쿠키 업데이트
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // 응답 쿠키 업데이트 (브라우저에 Set-Cookie 헤더 전달)
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() 대신 getUser()를 사용 — 서버에서 검증된 사용자 정보
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 보호된 경로에 미로그인 접근 시 로그인 페이지로 이동
  // (알림 클릭 등으로 들어왔다가 세션 만료로 튕길 때, 로그인 후 원래 목적지로 복귀시키기 위해
  //  경로+쿼리를 next에 담아둔다)
  if (!user && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    const nextPath = pathname + request.nextUrl.search // 원래 가려던 곳 (경로 + 쿼리)
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''
    redirectUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(redirectUrl)
  }

  // 로그인 상태에서 인증 경로 접근 시 대시보드로 이동
  if (user && authRoutes.some((route) => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에 프록시 적용:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - sitemap.xml, robots.txt
     *
     * favicon.ico는 제외하지 않는다 — 고객사 도메인에서 그 업체 아이콘으로 넘겨야 하기 때문.
     * (퀄리오 도메인 요청은 proxy 앞부분에서 곧바로 통과시킨다)
     *
     * IndexNow 키 파일(1c5b6…​.txt)도 제외한다. 이 파일은 "이 도메인이 내 것"임을 증명하는
     * 소유 확인 파일이라 고객사 자체 도메인에서도 그대로 열려야 한다. 프록시를 타면
     * /biz/{도메인}/1c5b….txt 로 바뀌어 404가 나고, 그러면 그 도메인 글은 네이버·빙에
     * 색인 알림을 보낼 수 없다(실제로 dartclean.co.kr에서 404였다).
     * ⚠️ .txt 전체를 제외하면 안 된다 — llms.txt는 업체별로 다른 내용을 줘야 해서 프록시를 타야 한다.
     */
    '/((?!_next/static|_next/image|sitemap.xml|robots.txt|1c5b60cb44784531b64a1b74ac04ee4c\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
