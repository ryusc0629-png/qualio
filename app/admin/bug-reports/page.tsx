import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format/datetime'

// 항상 최신 신고를 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

type BugReport = {
  id: string
  business_id: string | null
  reporter_name: string | null
  message: string
  page_url: string | null
  user_agent: string | null
  status: string
  created_at: string
}

// 처리 상태 라벨/색상
const STATUS_META: Record<string, { label: string; className: string }> = {
  new: { label: '신규', className: 'bg-red-100 text-red-700' },
  reviewing: { label: '확인 중', className: 'bg-amber-100 text-amber-700' },
  resolved: { label: '해결됨', className: 'bg-slate-100 text-slate-500' },
}

export default async function BugReportsPage() {
  // bug_reports는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
  const looseDb = createServiceClient() as unknown as SupabaseClient
  const { data } = (await looseDb
    .from('bug_reports')
    .select('id, business_id, reporter_name, message, page_url, user_agent, status, created_at')
    .order('created_at', { ascending: false })) as unknown as { data: BugReport[] | null }

  const rows = data ?? []
  const total = rows.length
  const newCount = rows.filter((r) => r.status === 'new').length
  const resolvedCount = rows.filter((r) => r.status === 'resolved').length

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">오류 신고</h1>
        <span className="text-xs text-muted-foreground">베타 사용자 신고 모음</span>
      </div>

      {/* 요약 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-red-50/40 border-red-200 p-4">
          <p className="text-xs text-muted-foreground">전체 신고</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{total}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">신규(미확인)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{newCount}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">해결됨</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{resolvedCount}</p>
        </div>
      </div>

      {/* 명단 — 모바일 카드 목록 */}
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-background py-12 text-center">
          <p className="text-3xl">🐞</p>
          <p className="mt-2 text-sm text-muted-foreground">아직 접수된 오류 신고가 없어요</p>
          <p className="mt-1 text-xs text-muted-foreground">
            사장님이 앱에서 &lsquo;오류 신고&rsquo;를 누르면 여기에 쌓입니다
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.new
            return (
              <li key={r.id} className="rounded-lg border bg-background px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{r.reporter_name ?? '(비로그인)'}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateTime(r.created_at, {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">
                  {r.message}
                </p>
                {r.page_url && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    화면: <span className="font-mono">{r.page_url}</span>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
