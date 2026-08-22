import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { startOfMonth, endOfMonth, addMonths, subMonths, getDay, format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toMarketYmd, marketDayRange, formatTime } from '@/lib/format/datetime'
import { getHolidayName } from '@/lib/holidays/kr'
import { FieldMonthCalendar, type CalendarCell, type CalendarJob } from '@/components/field/field-month-calendar'

// 직원·도급사의 월별 일정 달력.
// 오늘 화면만으로는 "다음 주에 쉴 수 있나"를 알 수 없어, 한 달을 통째로 보게 한다.
// 보기 전용이다 — 배정과 일정 변경은 사장님 화면(/dashboard/schedule)에서만 한다.
export const dynamic = 'force-dynamic'

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
  status: string
}

interface Props {
  params: Promise<{ workerId: string }>
  searchParams: Promise<{ month?: string }>
}

export default async function FieldSchedulePage({ params, searchParams }: Props) {
  const { workerId } = await params
  const { month } = await searchParams
  const db = createServiceClient()

  const { data: worker } = await db
    .from('workers' as never)
    .select('id, name, business_id, is_active' as never)
    .eq('id' as never, workerId)
    .maybeSingle() as { data: WorkerRow | null }

  if (!worker || !worker.is_active) notFound()

  // 날짜 계산은 '연-월-일'만 다루고, DB 조회 시각으로 바꿀 때만 한국 시간대를 입힌다(marketDayRange).
  // 이렇게 하지 않으면 서버(UTC) 자정과 한국 자정이 9시간 어긋나 달 첫날 오전 0~9시 일정이 통째로 빠진다.
  const parseYmd = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const todayYmd = toMarketYmd()
  // month는 'yyyy-MM-dd'(그 달의 1일). 형식이 깨졌거나 없는 달(2026-13-99 등)이면 이번 달로 되돌린다.
  // 주소창을 손댄 값 때문에 엉뚱한 달이 열리면 직원은 "달력이 고장났다"고 본다.
  const isValidMonth = (() => {
    if (typeof month !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(month)) return false
    const [y, m, d] = month.split('-').map(Number)
    if (m < 1 || m > 12 || d < 1 || d > 31) return false
    const parsed = parseYmd(month)
    return parsed.getFullYear() === y && parsed.getMonth() === m - 1
  })()
  const baseDate = startOfMonth(parseYmd(isValidMonth ? month! : todayYmd))

  const firstYmd = format(baseDate, 'yyyy-MM-dd')
  const lastYmd = format(endOfMonth(baseDate), 'yyyy-MM-dd')
  const prevMonthYmd = format(subMonths(baseDate, 1), 'yyyy-MM-dd')
  const nextMonthYmd = format(addMonths(baseDate, 1), 'yyyy-MM-dd')
  const monthLabel = format(baseDate, 'yyyy년 M월', { locale: ko })

  const { from: rangeFrom, to: rangeTo } = marketDayRange(firstYmd, lastYmd)

  // 이 직원이 배정된 예약 — worker_id 직접 배정 + booking_workers 팀원 배정 모두 포함(오늘 화면과 동일)
  type BwRow = { booking_id: string }
  const { data: bwRows } = await db
    .from('booking_workers' as never)
    .select('booking_id' as never)
    .eq('worker_id' as never, workerId) as { data: BwRow[] | null }

  const assignedIds = (bwRows ?? []).map((r) => r.booking_id)

  // 취소·불참·삭제된 일정은 뺀다. 달력에서 빼야 그 날이 '비어 있는 날'로 제대로 보인다.
  const baseQuery = () =>
    db
      .from('bookings')
      .select('id, customer_name, service_address, scheduled_at, status')
      .eq('business_id', worker.business_id)
      .gte('scheduled_at', rangeFrom)
      .lte('scheduled_at', rangeTo)
      .is('deleted_at', null)
      .not('status', 'in', '("cancelled","no_show")')
      .order('scheduled_at', { ascending: true })

  const { data: bookings } = assignedIds.length > 0
    ? await (baseQuery()
        .or(`worker_id.eq.${workerId},id.in.(${assignedIds.join(',')})`) as unknown as Promise<{ data: BookingRow[] | null }>)
    : await (baseQuery()
        .eq('worker_id' as never, workerId) as unknown as Promise<{ data: BookingRow[] | null }>)

  const jobs = bookings ?? []

  // 날짜별로 묶는다. 'sv-SE'는 YYYY-MM-DD 형식이라 키로 쓰기 좋다.
  const jobsByDate: Record<string, CalendarJob[]> = {}
  for (const job of jobs) {
    const key = new Date(job.scheduled_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
    const list = jobsByDate[key] ?? []
    list.push({
      id: job.id,
      time: formatTime(job.scheduled_at),
      customerName: job.customer_name,
      address: job.service_address,
      status: job.status,
    })
    jobsByDate[key] = list
  }

  // 달력 칸 — 날짜·요일·공휴일을 서버에서 만들어 넘긴다(폰 시간대 영향 제거)
  const daysInMonth = endOfMonth(baseDate).getDate()
  const cells: CalendarCell[] = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), i + 1)
    const ymd = format(d, 'yyyy-MM-dd')
    return {
      ymd,
      day: i + 1,
      weekday: getDay(d),
      holiday: getHolidayName(ymd),
      isPast: ymd < todayYmd,
    }
  })
  const leadingBlanks = getDay(baseDate)

  // 이번 달을 보고 있으면 오늘, 다른 달이면 그 달 1일을 펼쳐 둔다
  const initialSelected = todayYmd >= firstYmd && todayYmd <= lastYmd ? todayYmd : firstYmd

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <Link
          href={`/field/${workerId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          오늘 일정으로
        </Link>

        <div className="flex items-center justify-between">
          <Link
            href={`/field/${workerId}/schedule?month=${prevMonthYmd}`}
            className="h-11 w-11 flex items-center justify-center rounded-lg border"
            aria-label="이전 달"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <h1 className="text-lg font-bold">{monthLabel}</h1>

          <Link
            href={`/field/${workerId}/schedule?month=${nextMonthYmd}`}
            className="h-11 w-11 flex items-center justify-center rounded-lg border"
            aria-label="다음 달"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-1.5">
          {worker.name}님 · 이 달 {jobs.length}곳
        </p>
      </div>

      <div className="px-4 py-4 pb-10">
        <FieldMonthCalendar
          workerId={workerId}
          cells={cells}
          leadingBlanks={leadingBlanks}
          jobsByDate={jobsByDate}
          todayYmd={todayYmd}
          initialSelected={initialSelected}
        />

        {/* 빈 날을 '확정된 휴무'로 오해하지 않게 한 줄로 못을 박는다.
            배정은 사장님이 그때그때 하므로 앞 달은 아직 비어 있을 수 있다. */}
        <p className="mt-4 text-xs text-muted-foreground text-center leading-relaxed">
          비어 있는 날은 아직 배정이 없다는 뜻이에요.<br />
          쉬는 날을 잡으려면 사장님께 미리 말씀해주세요.
        </p>
      </div>
    </div>
  )
}
