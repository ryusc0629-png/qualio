import Link from 'next/link'
import { requireAdmin } from '@/lib/admin/auth'

// 퀄리오 본사 전용 영역 — 관리자 이메일만 접근(requireAdmin)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">퀄리오 본사 · 내부 지표</span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
              ADMIN
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
              지표
            </Link>
            <Link href="/admin/pre-registrations" className="text-sm text-muted-foreground hover:text-foreground">
              사전신청
            </Link>
            <Link href="/admin/academy-inquiries" className="text-sm text-muted-foreground hover:text-foreground">
              학원 제휴
            </Link>
            <Link href="/admin/lessons" className="text-sm text-muted-foreground hover:text-foreground">
              OPS 강의
            </Link>
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              내 대시보드로 →
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
