import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DoorOpen, Lock, MapPin, ShieldAlert, CheckCircle2, Navigation, ListChecks } from 'lucide-react'
import {
  getTodayLockupData,
  computeVisitStatus,
  type LockupVisitStatus,
} from '@/lib/lockup/today'
import { haversine } from '@/lib/roadmap/geo'

// 도착 위치와 현장의 거리(m) — 좌표가 둘 다 있을 때만
function distanceMeters(v: {
  checkin_lat: number | null; checkin_lng: number | null; site_lat: number | null; site_lng: number | null
}): number | null {
  if (v.checkin_lat == null || v.checkin_lng == null || v.site_lat == null || v.site_lng == null) return null
  return haversine({ lat: v.checkin_lat, lng: v.checkin_lng }, { lat: v.site_lat, lng: v.site_lng }) * 1000
}

function distanceLabel(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

// 대표용 출퇴근·문단속 현황 (오늘)
// 문단속 필요 정기 현장에서 직원이 올린 도착(오픈)/마감(잠금) 사진과 시각을 한눈에 본다.
// 아직 마감이 안 된 현장, 예상 시간이 지난 현장을 빨갛게 드러내 사고를 막는다.

export const dynamic = 'force-dynamic'

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
}

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

  // 오늘 문단속 현장 데이터 (공용 로직 — 홈 카드와 동일한 계산)
  const { hasContracts, visits, durationById, checklistByContract, lockupById } = await getTodayLockupData(db, businessId)

  // 담당자 이름 맵
  const { data: workers } = await db
    .from('workers' as never)
    .select('id, name' as never)
    .eq('business_id' as never, businessId) as unknown as { data: { id: string; name: string }[] | null }
  const workerName = new Map((workers ?? []).map((w) => [w.id, w.name]))

  // 이 파일은 서버 컴포넌트라 요청이 올 때 서버에서 한 번만 실행된다.
  // 브라우저에서 다시 그리는 일이 없어 '현재 시각'을 그대로 써도 화면이 흔들리지 않는다.
  /* eslint-disable react-hooks/purity */
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const now = Date.now()
  /* eslint-enable react-hooks/purity */
  // 문단속을 안 켠 현장은 작업 항목 진행으로 판정한다 — 안 넘기면 종일 '미도착'으로 뜬다
  const withStatus = visits.map((v) => ({ v, s: computeVisitStatus(v, durationById, now, { lockupById, checklistByContract }) }))
  const doneCount = withStatus.filter((x) => x.s === 'done').length
  const overdueCount = withStatus.filter((x) => x.s === 'overdue').length

  const STATUS_META: Record<LockupVisitStatus, { label: string; badge: string; card: string }> = {
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

      {!hasContracts ? (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-2">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">아직 지켜볼 현장이 없어요</p>
          <p className="text-xs text-muted-foreground">
            고객 관리에서 정기계약의 &lsquo;문단속&rsquo;을 켜거나 &lsquo;현장에서 할 일&rsquo;을 정하면
            여기에 오늘 현황이 나타나요
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
                // GPS 도착 위치 — 현장과의 거리(있으면), 지도 링크
                const dist = distanceMeters(v)
                const near = dist != null && dist <= 300
                const mapUrl = v.checkin_lat != null && v.checkin_lng != null
                  ? `https://map.kakao.com/link/map/도착위치,${v.checkin_lat},${v.checkin_lng}`
                  : null
                // 작업 체크리스트 진행
                const items = checklistByContract.get(v.contract_id ?? '') ?? []
                const cp = v.checklist_photos ?? {}
                const checkDone = items.filter((it) => (cp[it.id]?.length ?? 0) > 0).length
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

                    {/* GPS 도착 위치 — 현장 근처인지 표시(막지 않고 증빙만) */}
                    {mapUrl && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <Navigation className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {dist != null ? (
                          <span
                            className={`font-medium px-1.5 py-0.5 rounded ${near ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                          >
                            현장에서 {distanceLabel(dist)} · {near ? '근처에서 찍음' : '멀리서 찍음'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">도착 위치 기록됨</span>
                        )}
                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          지도에서 보기
                        </a>
                      </div>
                    )}

                    {/* 작업 항목(체크리스트) 진행 + 항목별 사진 */}
                    {items.length > 0 && (
                      <div className="mt-3 rounded-lg border bg-muted/20 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
                          <ListChecks className="h-3.5 w-3.5 text-emerald-600" />
                          작업 항목
                          <span className={`ml-auto font-semibold ${checkDone === items.length ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {checkDone}/{items.length} 완료
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {items.map((it) => {
                            const urls = cp[it.id] ?? []
                            return (
                              <li key={it.id} className="flex items-center gap-2">
                                {urls.length > 0 ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 inline-block shrink-0" />
                                )}
                                <span className="text-xs flex-1 truncate">{it.label}</span>
                                <PhotoRow urls={urls} alt={it.label} />
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
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
