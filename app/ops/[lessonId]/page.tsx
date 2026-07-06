import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLessonById } from '@/lib/ops/lessons'
import { VimeoPlayer } from '@/components/ops/vimeo-player'
import { ArrowLeft, Lock } from 'lucide-react'

interface Props {
  params: Promise<{ lessonId: string }>
}

// 개별 강의 재생 — 무료 강의는 누구나, 회원 전용은 로그인해야 재생된다.
export const dynamic = 'force-dynamic'

export default async function LessonPage({ params }: Props) {
  const { lessonId } = await params

  const [lesson, authResult] = await Promise.all([
    getLessonById(lessonId),
    createClient().then((c) => c.auth.getUser()),
  ])

  // 없거나 아직 공개 안 된 강의는 노출하지 않음
  if (!lesson || !lesson.published) notFound()

  const isLoggedIn = !!authResult.data.user
  const canWatch = lesson.is_free || isLoggedIn

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/ops"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        강의 목록
      </Link>

      {canWatch ? (
        <>
          <VimeoPlayer vimeoId={lesson.vimeo_id} title={lesson.title} />
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{lesson.title}</h1>
              {lesson.is_free && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  무료
                </span>
              )}
            </div>
            {lesson.description && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {lesson.description}
              </p>
            )}
          </div>

          {/* 다운펀넬 CTA — 배운 걸 퀄리오로 바로 실습 */}
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 text-center">
            <p className="text-sm font-semibold">방금 배운 내용, 퀄리오로 바로 해보세요</p>
            <p className="mt-1 text-xs text-muted-foreground">
              견적·예약·알림톡을 한 곳에서. 무료로 시작할 수 있어요.
            </p>
            <Link
              href={isLoggedIn ? '/dashboard' : '/signup'}
              className="mt-3 inline-flex h-12 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {isLoggedIn ? '내 대시보드에서 실습하기' : '퀄리오 무료로 시작하기'}
            </Link>
          </div>
        </>
      ) : (
        // 회원 전용 잠금 화면
        <div className="rounded-xl border bg-background p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-bold">{lesson.title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            이 강의는 회원 전용이에요. 퀄리오 계정을 만들면(무료) 이 강의를 포함한 전체 강의를 보실 수 있어요.
          </p>
          <div className="mt-5 flex flex-col items-center gap-2">
            <Link
              href="/signup"
              className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              퀄리오 무료로 시작하고 이어보기
            </Link>
            <Link href="/login" className="text-xs text-muted-foreground underline underline-offset-2">
              이미 회원이신가요? 로그인
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
