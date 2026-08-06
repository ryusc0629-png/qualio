import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DoorOpen, Lock, MapPin, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react'

// 대표용 출퇴근·문단속 현황 (오늘)
// 문단속 필요 정기 현장에서 직원이 올린 도착(오픈)/마감(잠금) 사진과 시각을 한눈에 본다.
// 아직 마감이 안 된 현장, 예상 시간이 지난 현장을 빨갛게 드러내 사고를 막는다.

export const dynamic = 'force-dynamic'

const BUFFER_MINUTES = 30
const DEFAULT_DURATION_MINUTES = 120

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
}

type VisitStatus = 'not_arrived' | 'working' | 'overdue' | 'done'

export default async function AttendancePage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) redirect('/onboarding')
  const businessId = profile.business_id

  // 1) 문단속 필요 계약
  const { data: contractsRaw } = await db
    .from('contracts')
    .select('id, expected_duration_minutes' as never)
    .eq('business_id', businessId)
    .eq('requires_lockup' as never, true) as unknown as {
      data: { id: string; expected_duration_minutes: number | null }[] | null
    }
  const contracts = contractsRaw ?? []
  const durationById = new Map(contracts.map((c) => [c.id, c.expected_duration_minutes ?? DEFAULT_DURATION_MINUTES]))

  // 오늘(KST) 범위
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayStr = kstNow.toISOString().slice(0, 10)
  const dayStart = new Date(`${todayStr}T00:00:00+09:00`).toISOString()
  const dayEnd = new Date(`${todayStr}T23:59:59+09:00`).toISOString()

  // 2) 오늘 문단속 현장 방문
  type VisitRow = {
    id: string; customer_name: string | null; service_address: string | null
    scheduled_at: string; worker_id: string | null; contract_id: string | null
    checkin_at: string | null; checkout_at: string | null
    open_photo_urls: string[] | null; lockup_photo_urls: string[] | null
  }
  let visits: VisitRow[] = []
  if (durationById.size > 0) {
    const { data } = await db
      .from('bookings')
      .select('id, customer_name, service_address, scheduled_at, worker_id, contract_id, checkin_at, checkout_at, open_photo_urls, lockup_photo_urls' as never)
      .eq('business_id', businessId)
      .in('contract_id' as never, Array.from(durationById.keys()))
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd)
      .is('deleted_at' as never, null)
      .not('status', 'in', '("cancelled","no_show")')
      .order('scheduled_at', { ascending: true }) as unknown as { data: VisitRow[] | null }
    visits = data ?? []
  }

  // 담당자 이름 맵
  const { data: workers } = await db
    .from('workers' as never)
    .select('id, name' as never)
    .eq('business_id' as never, businessId) as unknown as { data: { id: string; name: string }[] | null }
  const workerName = new Map((workers ?? []).map((w) => [w.id, w.name]))

  const now = Date.now()
  const statusOf = (v: VisitRow): VisitStatus => {
    if (v.checkout_at) return 'done'
    if (!v.checkin_at) return 'not_arrived'
    const dur = durationById.get(v.contract_id ?? '') ?? DEFAULT_DURATION_MINUTES
    const deadline = new Date(v.checkin_at).getTime() + (dur + BUFFER_MINUTES) * 60 * 1000
    return now >= deadline ? 'overdue' : 'working'
  }

  const withStatus = visits.map((v) => ({ v, s: statusOf(v) }))
  const doneCount = withStatus.filter((x) => x.s === 'done').length
  const overdueCount = withStatus.filter((x) => x.s === 'overdue').length

  const STATUS_META: Record<VisitStatus, { label: string; badge: string; card: string }> = {
    not_arrived: { label: '미도착',    badge: 'bg-gray-100 text-gray-600',       card: 'border-l-4 border-l-gray-300' },
    working:     { label: '작업 중',   badge: 'bg-amber-100 text-amber-700',     card: 'border-l-4 border-l-amber-400 bg-amber-50/30' },
    overdue:     { label: '미마감 확인 필요', badge: 'bg-red-100 text-red-700',   card: 'border-l-4 border-l-red-400 bg-red-50/40' },
    done:        { label: '문단속 완료', badge: 'bg-emerald-100 text-emerald-700', card: 'border-l-4 border-l-emerald-400 bg-emerald-50/30' },
  }

  const dateDisplay = kstNow.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">문단속·출퇴근 현황</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          오늘 문단속 현장의 도착·마감 상태를 한눈에 확인하세요 · {dateDisplay}
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-2">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">아직 문단속 현장이 없어요</p>
          <p className="text-xs text-muted-foreground">
            정기계약 화면에서 현장의 &lsquo;문단속&rsquo;을 켜면 여기에 도착·마감 현황이 나타나요
          </p>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{visits.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">오늘 문단속 현장</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${doneCount > 0 ? 'bg-emerald-50 border-emerald-200' : ''}`}>
              <p className={`text-2xl font-bold ${doneCount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{doneCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">마감 완료</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${overdueCount > 0 ? 'bg-red-50 border-red-200' : ''}`}>
              <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{overdueCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">확인 필요</p>
            </div>
          </div>

          {visits.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <DoorOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">오늘 예정된 문단속 현장이 없어요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {withStatus.map(({ v, s }) => {
                const meta = STATUS_META[s]
                const opens = v.open_photo_urls ?? []
                const locks = v.lockup_photo_urls ?? []
                return (
                  <div key={v.id} className={`rounded-xl bg-white border p-4 ${meta.card}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{v.customer_name ?? '고객'}</h3>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${meta.badge}`}>
                        {s === 'overdue' && <ShieldAlert className="h-3 w-3" />}
                        {s === 'done' && <CheckCircle2 className="h-3 w-3" />}
                        {meta.label}
                      </span>
                    </div>

                    {v.service_address && (
                      <div className="flex items-start gap-1.5 text-sm text-muted-foreground mb-2">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="line-clamp-1">{v.service_address}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        담당 <span className="text-foreground font-medium">{v.worker_id ? workerName.get(v.worker_id) ?? '—' : '미배정'}</span>
                      </span>
                    </div>

                    {/* 도착 / 마감 시각 + 사진 */}
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="rounded-lg border bg-muted/30 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                          <DoorOpen className="h-3.5 w-3.5" /> 도착 {fmtTime(v.checkin_at)}
                        </div>
                        <PhotoRow urls={opens} alt="오픈" />
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                          <Lock className="h-3.5 w-3.5" /> 마감 {fmtTime(v.checkout_at)}
                        </div>
                        <PhotoRow urls={locks} alt="잠금" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PhotoRow({ urls, alt }: { urls: string[]; alt: string }) {
  if (urls.length === 0) {
    return <p className="text-[11px] text-muted-foreground">아직 없음</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-md overflow-hidden border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="w-full h-full object-cover" />
        </a>
      ))}
    </div>
  )
}
