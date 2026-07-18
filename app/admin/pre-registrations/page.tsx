import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format/datetime'

// 항상 최신 신청 명단을 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

type PreRegistration = {
  id: string
  name: string
  phone: string
  owner_status: string
  contacted: boolean
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  operating: '운영 중',
  preparing: '창업 준비 중',
}

// 숫자만 저장된 번호를 010-1234-5678 형태로 표시
function formatPhone(phone: string): string {
  if (phone.length === 11) return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
  if (phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
  return phone
}

export default async function PreRegistrationsPage() {
  // pre_registrations는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
  const looseDb = createServiceClient() as unknown as SupabaseClient
  const { data } = (await looseDb
    .from('pre_registrations')
    .select('id, name, phone, owner_status, contacted, created_at')
    .order('created_at', { ascending: false })) as unknown as { data: PreRegistration[] | null }

  const rows = data ?? []
  const total = rows.length
  const operating = rows.filter((r) => r.owner_status === 'operating').length
  const preparing = rows.filter((r) => r.owner_status === 'preparing').length

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">90일 챌린지 사전신청</h1>
        <span className="text-xs text-muted-foreground">1기 대기명단</span>
      </div>

      {/* 요약 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-emerald-50/40 border-emerald-200 p-4">
          <p className="text-xs text-muted-foreground">전체 신청</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{total}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">운영 중</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{operating}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">창업 준비 중</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{preparing}</p>
        </div>
      </div>

      {/* 명단 — 모바일 카드 목록 */}
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-background py-12 text-center">
          <p className="text-3xl">📭</p>
          <p className="mt-2 text-sm text-muted-foreground">아직 사전신청이 없어요</p>
          <p className="mt-1 text-xs text-muted-foreground">
            첫 영상이 공개되면 여기에 신청자가 쌓입니다
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{r.name}</span>
                  <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    {STATUS_LABEL[r.owner_status] ?? r.owner_status}
                  </span>
                  {r.contacted && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      연락함
                    </span>
                  )}
                </div>
                <a
                  href={`tel:${r.phone}`}
                  className="mt-0.5 block text-sm text-emerald-700 tabular-nums hover:underline"
                >
                  {formatPhone(r.phone)}
                </a>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatDateTime(r.created_at, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
