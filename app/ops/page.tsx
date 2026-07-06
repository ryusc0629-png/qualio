import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPublishedLessons } from '@/lib/ops/lessons'
import { Lock, PlayCircle, GraduationCap } from 'lucide-react'

// OPS 영상 교육 배움터 (공개) — 무료 강의는 누구나, 나머지는 로그인(=퀄리오 계정) 필요
// 항상 최신 강의 목록을 보여준다(관리자가 추가하면 바로 반영)
export const dynamic = 'force-dynamic'

export default async function OpsLandingPage() {
  const [lessons, authResult] = await Promise.all([
    getPublishedLessons(),
    createClient().then((c) => c.auth.getUser()),
  ])
  const isLoggedIn = !!authResult.data.user

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* 히어로 — 성과(증거)를 앞세워 신뢰 형성 */}
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
          <GraduationCap className="h-3.5 w-3.5" />
          퀄리오 OPS 배움터
        </div>
        <h1 className="text-2xl font-bold leading-snug">
          청소업, 혼자 부딪히지 말고
          <br />
          배우고 시작하세요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          수강생 평균, 2개월 만에 매출이 크게 늘었어요.
          <br />첫 강의는 무료로 열려 있어요. 지금 바로 보세요.
        </p>
      </div>

      {/* 강의 목록 */}
      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <PlayCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">아직 준비된 강의가 없어요. 곧 올라옵니다.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {lessons.map((lesson, index) => {
            const locked = !lesson.is_free && !isLoggedIn
            return (
              <li key={lesson.id}>
                <Link
                  href={`/ops/${lesson.id}`}
                  className="flex items-center gap-4 rounded-xl border bg-background p-4 transition hover:border-emerald-300 hover:bg-emerald-50/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{lesson.title}</p>
                    {lesson.duration_label && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{lesson.duration_label}</p>
                    )}
                  </div>
                  {lesson.is_free ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      무료
                    </span>
                  ) : locked ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      회원 전용
                    </span>
                  ) : (
                    <PlayCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {/* 비로그인 유도 — 무료 강의로 신뢰 쌓은 뒤 가입 전환 */}
      {!isLoggedIn && lessons.length > 0 && (
        <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 text-center">
          <p className="text-sm font-semibold">전체 강의를 무료로 이어보시겠어요?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            퀄리오 계정을 만들면 나머지 강의까지 모두 보실 수 있어요.
          </p>
          <Link
            href="/signup"
            className="mt-3 inline-flex h-12 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            퀄리오 무료로 시작하기
          </Link>
        </div>
      )}
    </div>
  )
}
