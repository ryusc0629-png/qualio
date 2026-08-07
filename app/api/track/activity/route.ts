import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/auth'

// 대시보드 사용 행태 기록 — 로그인한 회원이 대시보드 화면을 열 때 클라이언트(UsageTracker)가 호출.
// 추적 실패가 사용자 화면을 막지 않도록 항상 가볍게 응답한다.
export async function POST(req: Request) {
  try {
    const { path } = (await req.json()) as { path?: string }
    if (!path || typeof path !== 'string' || !path.startsWith('/dashboard')) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    // 세션에서 사용자 확인 (쿠키 기반) — 비로그인은 기록하지 않음
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    // 본사(관리자)의 사용은 통계에서 제외 — '회원이 어떻게 쓰는지'만 보기 위함
    if (isAdminEmail(user.email)) return NextResponse.json({ ok: true, skipped: true })

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) return NextResponse.json({ ok: true, skipped: true })

    // 쿼리스트링 제거 후 경로만 저장 — activity_events 타입이 database.ts에 아직 없어 단언
    const cleanPath = path.split('?')[0].slice(0, 200)
    await db.from('activity_events' as never).insert({
      business_id: profile.business_id,
      user_id: user.id,
      path: cleanPath,
    } as never)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Activity] 사용 기록 실패:', e)
    // 추적 실패는 사용자 경험과 무관 — 200으로 조용히 넘긴다
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
