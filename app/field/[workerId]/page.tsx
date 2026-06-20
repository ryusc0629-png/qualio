import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Clock, ChevronRight, Briefcase } from 'lucide-react'
import { WorkerPushToggle } from '@/components/field/worker-push-toggle'

// workers 테이블 타입 (Supabase 타입 아직 미생성)
interface WorkerRow {
  id: string
  name: string
  business_id: string
  is_active: boolean
}

interface BookingRow {
  id: string
  customer_name: string
  service_address: string | null
  scheduled_at: string
  final_price: number
  status: string
  memo: string | null
}

interface Props {
  params: Promise<{ workerId: string }>
}

// 홈 화면에 추가했을 때 전역 매니페스트(대시보드)가 아니라 이 직원의 현장 앱으로 열리도록
// 매니페스트 링크를 현장 전용으로 덮어쓴다.
export async function generateMetadata({ params }: Props) {
  const { workerId } = await params
  return {
    manifest: `/field/${workerId}/manifest`,
    appleWebApp: { capable: true, title: '퀄리오 현장', statusBarStyle: 'default' as const },
  }
}

export default async function FieldDashboard({ params }: Props) {
  const { workerId } = await params
  const db = createServiceClient()

  // 직원 정보 조회
  const { data: worker } = await db
    .from('workers' as never)
    .select('id, name, business_id, is_active' as never)
    .eq('id' as never, workerId)
    .maybeSingle() as { data: WorkerRow | null }

  if (!worker || !worker.is_active) notFound()

  // 업체명 조회
  const { data: business } = await db
    .from('businesses')
    .select('name')
    .eq('id', worker.business_id)
    .maybeSingle()

  const businessName = business?.name ?? ''

  // 오늘 KST 기준 예약 조회
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + kstOffset)
  const todayStr = kstNow.toISOString().slice(0, 10)
  const todayStart = new Date(`${todayStr}T00:00:00+09:00`).toISOString()
  const todayEnd = new Date(`${todayStr}T23:59:59+09:00`).toISOString()

  // booking_workers에서 이 직원이 배정된 booking_id 목록 조회 (팀원 포함)
  type BwRow = { booking_id: string }
  const { data: bwRows } = await db
    .from('booking_workers' as never)
    .select('booking_id' as never)
    .eq('worker_id' as never, workerId) as { data: BwRow[] | null }

  const assignedIds = (bwRows ?? []).map((r) => r.booking_id)

  // worker_id 직접 배정 OR booking_workers 팀원 배정 모두 포함
  const { data: bookings } = assignedIds.length > 0
    ? await (db
        .from('bookings')
        .select('id, customer_name, service_address, scheduled_at, final_price, status, memo')
        .eq('business_id', worker.business_id)
        .or(`worker_id.eq.${workerId},id.in.(${assignedIds.join(',')})`)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd)
        .order('scheduled_at', { ascending: true }) as unknown as Promise<{ data: BookingRow[] | null }>)
    : await (db
        .from('bookings')
        .select('id, customer_name, service_address, scheduled_at, final_price, status, memo')
        .eq('business_id', worker.business_id)
        .eq('worker_id' as never, workerId)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd)
        .order('scheduled_at', { ascending: true }) as unknown as Promise<{ data: BookingRow[] | null }>)

  const jobs = bookings ?? []

  const statusLabel: Record<string, string> = {
    confirmed:   '예정',
    in_progress: '작업 중',
    completed:   '완료',
    cancelled:   '취소됨',
    no_show:     '불참',
  }

  const statusColor: Record<string, string> = {
    confirmed:   'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed:   'bg-emerald-100 text-emerald-700',
    cancelled:   'bg-gray-100 text-gray-500',
    no_show:     'bg-red-100 text-red-700',
  }

  // 작업 카드 좌측 색상 띠 + 배경 — 상태가 한눈에 구분되도록
  const cardAccent: Record<string, string> = {
    confirmed:   'border-l-4 border-l-blue-400 hover:border-primary/30',
    in_progress: 'border-l-4 border-l-amber-400 bg-amber-50/40',
    completed:   'border-l-4 border-l-emerald-400 bg-emerald-50/40',
    cancelled:   'border-l-4 border-l-gray-300 bg-gray-50 opacity-70',
    no_show:     'border-l-4 border-l-red-300 bg-red-50/40',
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
  }

  function formatPrice(price: number) {
    return price.toLocaleString('ko-KR') + '원'
  }

  const dateDisplay = kstNow.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
  const pendingCount = jobs.filter((j) => j.status === 'confirmed' || j.status === 'in_progress').length
  const completedCount = jobs.filter((j) => j.status === 'completed').length

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <p className="text-xs text-muted-foreground">{businessName}</p>
        <h1 className="text-lg font-bold mt-0.5">{worker.name}님의 오늘 일정</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{dateDisplay}</p>
      </div>

      {/* 요약 — 남은 작업(파랑) vs 완료(초록) 색상 구분 */}
      {jobs.length > 0 && (
        <div className="flex gap-3 px-4 py-3">
          <div className={`flex-1 rounded-xl border px-4 py-3 text-center ${pendingCount > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-2xl font-bold ${pendingCount > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{pendingCount}</p>
            <p className={`text-xs font-medium ${pendingCount > 0 ? 'text-blue-700' : 'text-muted-foreground'}`}>남은 작업</p>
          </div>
          <div className={`flex-1 rounded-xl border px-4 py-3 text-center ${completedCount > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-2xl font-bold ${completedCount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{completedCount}</p>
            <p className={`text-xs font-medium ${completedCount > 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>완료</p>
          </div>
        </div>
      )}

      {/* 작업 목록 */}
      <div className="px-4 pb-8 space-y-3 mt-1">
        {jobs.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">오늘 배정된 작업이 없어요</p>
            <p className="text-xs text-muted-foreground">새 작업이 배정되면 이 화면에 자동으로 나타나요</p>
          </div>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              href={`/field/${workerId}/${job.id}`}
              className={`block rounded-xl bg-white border transition-colors ${cardAccent[job.status] ?? 'hover:border-primary/30'}`}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{formatTime(job.scheduled_at)}</span>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel[job.status] ?? job.status}
                  </span>
                </div>

                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-semibold">{job.customer_name}</h3>
                  <span className="text-sm font-medium text-primary">{formatPrice(job.final_price)}</span>
                </div>

                {job.service_address && (
                  <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{job.service_address}</span>
                  </div>
                )}
              </div>

              <div className="border-t px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {job.status === 'confirmed' && '탭하여 작업 시작'}
                  {job.status === 'in_progress' && '탭하여 수금 완료'}
                  {job.status === 'completed' && '작업 완료됨'}
                  {job.status === 'cancelled' && '취소된 예약'}
                  {job.status === 'no_show' && '고객 불참'}
                </span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Link>
          ))
        )}

        {/* 앱 알림 켜기 — 클레임 처리 요청 등을 폰으로 받기 (직원 종속 핵심 길목) */}
        <div className="pt-2">
          <WorkerPushToggle workerId={workerId} />
        </div>
      </div>
    </div>
  )
}
