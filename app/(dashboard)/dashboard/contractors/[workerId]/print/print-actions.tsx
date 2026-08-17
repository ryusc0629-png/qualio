'use client'

import Link from 'next/link'

// 인쇄 화면 상단 툴바 — 인쇄물에는 나오지 않는다(print:hidden)
export function PrintActions({ workerId }: { workerId: string }) {
  return (
    <div className="print:hidden sticky top-0 z-50 flex flex-wrap items-center justify-end gap-2 border-b bg-white/95 px-3 py-2 backdrop-blur sm:fixed sm:top-4 sm:right-4 sm:left-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
      <button
        onClick={() => window.print()}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-primary/90"
      >
        PDF로 저장
      </button>
      <Link
        href={`/dashboard/contractors/${workerId}`}
        className="bg-white border px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-muted"
      >
        내용 고치기
      </Link>
    </div>
  )
}
