import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 인증이 필요한 경로 (미로그인 시 /login으로 리디렉션)
const protectedRoutes = ['/dashboard', '/onboarding']

// 이미 로그인된 사용자가 접근하면 /dashboard로 리디렉션할 경로
const authRoutes = ['/login', '/signup']

export async function proxy(request: NextRequest) {
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
  if (!user && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
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
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
