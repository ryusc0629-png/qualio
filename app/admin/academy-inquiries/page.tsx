import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format/datetime'

// 항상 최신 문의 명단을 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

type AcademyInquiry = {
  id: string
  academy_name: string
  contact_name: string
  phone: string
  region: string | null
  program_type: string | null
  student_scale: string | null
  message: string | null
  contacted: boolean
  created_at: string
}

const PROGRAM_LABEL: Record<string, string> = {
  cleaning: '청소·방역',
  other_tech: '기타 기술',
  preparing: '신설 준비',
}
const SCALE_LABEL: Record<string, string> = {
  small: '1~10명',
  medium: '11~30명',
  large: '30명+',
}

// 숫자만 저장된 번호를 010-1234-5678 형태로 표시
function formatPhone(phone: string): string {
  if (phone.length === 11) return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
  if (phone.length === 10) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
  return phone
}

export default async function AcademyInquiriesPage() {
  // academy_inquiries는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
  const looseDb = createServiceClient() as unknown as SupabaseClient
  const { data } = (await looseDb
    .from('academy_inquiries')
    .select(
      'id, academy_name, contact_name, phone, region, program_type, student_scale, message, contacted, created_at',
    )
    .order('created_at', { ascending: false })) as unknown as { data: AcademyInquiry[] | null }

  const rows = data ?? []
  const total = rows.length
  const cleaning = rows.filter((r) => r.program_type === 'cleaning').length
  const notContacted = rows.filter((r) => !r.contacted).length

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">기술 창업 학원 제휴 문의</h1>
        <span className="text-xs text-muted-foreground">카페 유입 리드</span>
      </div>

      {/* 요약 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-emerald-50/40 border-emerald-200 p-4">
          <p className="text-xs text-muted-foreground">전체 문의</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{total}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">청소·방역 과정</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{cleaning}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">미연락</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{notContacted}</p>
        </div>
      </div>

      {/* 명단 — 모바일 카드 목록 */}
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-background py-12 text-center">
          <p className="text-3xl">🏫</p>
          <p className="mt-2 text-sm text-muted-foreground">아직 제휴 문의가 없어요</p>
          <p className="mt-1 text-xs text-muted-foreground">
            카페 링크로 학원이 문의를 남기면 여기에 쌓입니다
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border bg-background px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold truncate">{r.academy_name}</span>
                    {r.program_type && (
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                        {PROGRAM_LABEL[r.program_type] ?? r.program_type}
                      </span>
                    )}
                    {r.student_scale && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        {SCALE_LABEL[r.student_scale] ?? r.student_scale}
                      </span>
                    )}
                    {r.contacted && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                        연락함
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-foreground">
                    {r.contact_name}
                    {r.region ? <span className="text-muted-foreground"> · {r.region}</span> : null}
                  </p>
                  <a
                    href={`tel:${r.phone}`}
                    className="mt-0.5 block text-sm text-emerald-700 tabular-nums hover:underline"
                  >
                    {formatPhone(r.phone)}
                  </a>
                  {r.message && (
                    <p className="mt-1.5 rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground break-keep">
                      {r.message}
                    </p>
                  )}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
