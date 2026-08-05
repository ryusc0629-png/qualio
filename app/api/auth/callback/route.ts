import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// 오픈 리다이렉트 방지 — 앱 내부 경로만 허용
// (/로 시작하고 //·/\ 같은 외부/프로토콜상대 주소가 아닐 때만 통과. 예: ?next=@evil.com 차단)
function safeInternalPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/dashboard'
  }
  return next
}

// Supabase 이메일 인증 후 리디렉션되는 콜백 처리
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeInternalPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=인증에 실패했습니다`)
}
