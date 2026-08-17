import { requireAdmin } from '@/lib/admin/auth'
import { getAdminNavCounts } from '@/lib/admin/nav-counts'
import { AdminNav } from './admin-nav'

// 퀄리오 본사 전용 영역 — 관리자 이메일만 접근(requireAdmin)
//
// 메뉴가 한 줄에 열한 개까지 늘어나 무엇부터 봐야 할지 알 수 없었다.
// 성격별로 묶어 왼쪽에 세우고, 처리할 일에는 남은 개수를 붙인다.
// 나중에 직원이 들어오면 이 순서가 그대로 하루 업무 순서가 된다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const counts = await getAdminNavCounts()

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <span className="text-sm font-semibold">퀄리오 본사</span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
            ADMIN
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[184px_1fr]">
        {/* 모바일에서는 내용 위에 접힌 목록처럼 쌓인다 */}
        <aside className="rounded-xl border bg-background p-3 md:sticky md:top-6 md:self-start">
          <AdminNav counts={counts} />
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
