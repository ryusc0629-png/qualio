import Link from 'next/link'
import { getAllLessons } from '@/lib/ops/lessons'
import { LessonsAdmin } from './lessons-admin'
import { ArrowLeft, ExternalLink } from 'lucide-react'

// OPS 영상 교육 강의 관리 (관리자 전용 — /admin 레이아웃이 requireAdmin로 게이팅)
export const dynamic = 'force-dynamic'

export default async function AdminLessonsPage() {
  const lessons = await getAllLessons()

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          지표 대시보드
        </Link>
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold">OPS 강의 관리</h1>
          <Link
            href="/ops"
            target="_blank"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            배움터 미리보기 <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Vimeo에 올린 영상을 여기 등록하면 배움터(/ops)에 노출됩니다. 무료 강의는 비회원도, 나머지는
          로그인한 퀄리오 회원만 볼 수 있어요.
        </p>
      </div>

      <LessonsAdmin lessons={lessons} />
    </div>
  )
}
