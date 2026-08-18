import { formatFrequency } from '@/lib/utils/frequency'

// 거래처 월간 보고서 요약 계산 — 날짜 나열이 아니라 '이번 달 어땠는지'를 한눈에 만든다.
// 페이지(서버 컴포넌트)는 화면 그리기에만 집중하고, 숫자 만드는 규칙은 전부 여기에 모은다.

export interface VisitLike {
  id: string
  scheduled_at: string
  status: string
  worker_id: string | null
  checkin_at?: string | null
  checkout_at?: string | null
  checklist_photos?: Record<string, string[]> | null
}

export interface ReportLike {
  booking_id: string
  notes: string | null
  preventive_note: string | null
}

/** 접수된 문제·클레임 — 담당자가 가장 먼저 보는 것은 '문제가 있었나, 처리됐나'다 */
export interface IssueLike {
  id: string
  title: string | null
  content: string | null
  status: string
  resolution: string | null
  created_at: string
  resolved_at: string | null
  /** 접수 사진(어디가 문제인지) / 처리 후 사진 — 위치와 결과는 사진이 문장보다 빠르다 */
  photo_urls?: string[] | null
  resolution_photo_urls?: string[] | null
}

/** 현장에서 고객이 추가로 요청한 것 — 방문에 붙어 있다 */
export interface RequestLike {
  booking_id: string
  scheduled_at: string
  request: string
}

export interface MonthlySummary {
  completedCount: number
  upcomingCount: number
  /** 이번 달 예정분 대비 완료 비율(%) — 이미 지난 방문만 분모로 삼는다 */
  onTimeRate: number | null
  /** 도착~마감 기록이 있는 방문의 총 작업 시간(분) */
  totalMinutes: number
  /** 현장에서 챙긴 것 — 날짜 + 내용 */
  siteNotes: { date: string; note: string }[]
  photoCount: number
  workerNames: string[]

  // ── 담당자가 실제로 궁금해하는 것 ────────────────────────
  // 방문 횟수·체류 시간보다 '문제가 있었나, 처리됐나'가 먼저다(사장님 지적 2026-08-18).
  /** 이번 달 접수된 문제·요청 건수 */
  issueCount: number
  /** 그중 처리 완료된 건수 */
  issueResolvedCount: number
  /** 처리율(%) — 접수가 없으면 null(0%로 보이면 안 된다) */
  issueResolveRate: number | null
  /** 접수·처리 내역 — 날짜 순 */
  issues: {
    date: string
    title: string
    detail: string | null
    resolution: string | null
    resolved: boolean
    photos: string[]
    resolutionPhotos: string[]
  }[]
  /** 현장에서 고객이 추가로 요청한 것 */
  requests: { date: string; note: string }[]
  /** 달을 넘긴 미해결 건 — 다음 달 계획에 그대로 올린다 */
  carriedOver: { date: string; title: string }[]
}

/** 두 시각 사이 분 — 비정상 값(음수·12시간 초과)은 집계에서 뺀다 */
function durationMinutes(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0
  const min = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  if (!Number.isFinite(min) || min <= 0 || min > 12 * 60) return 0
  return Math.round(min)
}

export function buildMonthlySummary(input: {
  visits: VisitLike[]
  reports: ReportLike[]
  workerNames: Map<string, string>
  photoCount: number
  /** 기준 시각(보통 지금) — '이미 지난 방문'을 가르는 선 */
  now: Date
  /** 이번 달 접수된 문제·클레임 */
  issues?: IssueLike[]
  /** 현장에서 받은 추가 요청 */
  requests?: RequestLike[]
}): MonthlySummary {
  const { visits, reports, workerNames, photoCount, now } = input
  const issueRows = input.issues ?? []
  const requestRows = input.requests ?? []

  const completed = visits.filter((v) => v.status === 'completed')
  const upcoming = visits.filter((v) => v.status !== 'completed')

  // 이행률 — 아직 안 온 날짜까지 분모에 넣으면 월초엔 항상 낮게 보여 오해를 준다
  const past = visits.filter((v) => new Date(v.scheduled_at) <= now)
  const pastCompleted = past.filter((v) => v.status === 'completed').length
  const onTimeRate = past.length > 0 ? Math.round((pastCompleted / past.length) * 100) : null

  const totalMinutes = completed.reduce((sum, v) => sum + durationMinutes(v.checkin_at, v.checkout_at), 0)

  // 현장 특이사항 — 완료된 방문에 남은 것만, 날짜 순
  const noteByBooking = new Map(
    reports
      .filter((r) => r.preventive_note && r.preventive_note.trim())
      .map((r) => [r.booking_id, r.preventive_note!.trim()]),
  )
  const siteNotes = completed
    .filter((v) => noteByBooking.has(v.id))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .map((v) => ({ date: v.scheduled_at, note: noteByBooking.get(v.id)! }))

  const names = [...new Set(completed.map((v) => v.worker_id).filter(Boolean) as string[])]
    .map((id) => workerNames.get(id))
    .filter((n): n is string => Boolean(n))

  // 문제·요청 — '처리됨'의 기준은 status가 resolved이거나 resolved_at이 찍힌 것
  const isResolved = (i: IssueLike) => i.status === 'resolved' || !!i.resolved_at
  const issuesSorted = [...issueRows].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const resolvedCount = issuesSorted.filter(isResolved).length
  const issues = issuesSorted.map((i) => ({
    date: i.created_at,
    title: (i.title ?? '').trim() || '요청 접수',
    detail: i.content?.trim() || null,
    resolution: i.resolution?.trim() || null,
    resolved: isResolved(i),
    photos: i.photo_urls ?? [],
    resolutionPhotos: i.resolution_photo_urls ?? [],
  }))

  const requests = requestRows
    .filter((r) => r.request.trim())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .map((r) => ({ date: r.scheduled_at, note: r.request.trim() }))

  const carriedOver = issuesSorted
    .filter((i) => !isResolved(i))
    .map((i) => ({ date: i.created_at, title: (i.title ?? '').trim() || '요청 접수' }))

  return {
    completedCount: completed.length,
    upcomingCount: upcoming.length,
    onTimeRate,
    totalMinutes,
    siteNotes,
    photoCount,
    workerNames: names,
    issueCount: issues.length,
    issueResolvedCount: resolvedCount,
    issueResolveRate: issues.length > 0 ? Math.round((resolvedCount / issues.length) * 100) : null,
    issues,
    requests,
    carriedOver,
  }
}

/** 분 → '12시간 30분' 같은 읽기 쉬운 문구 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

/**
 * 보고서 맨 위 한 줄 총평 — 담당자가 표를 읽지 않아도 이번 달을 알 수 있게.
 * 지어내지 않고 실제 집계값만 문장으로 엮는다.
 */
export function buildHeadline(input: {
  summary: MonthlySummary
  monthLabel: string
  serviceName: string | null
  frequency: string | null
}): string {
  const { summary, monthLabel, serviceName, frequency } = input
  const service = serviceName ?? '정기 청소'

  if (summary.completedCount === 0) {
    return summary.upcomingCount > 0
      ? `${monthLabel} ${service}는 ${summary.upcomingCount}회 방문이 예정되어 있습니다.`
      : `${monthLabel}에는 기록된 방문이 없습니다.`
  }

  const parts: string[] = []
  const cycle = frequency ? formatFrequency(frequency) : null
  parts.push(
    cycle && cycle !== '—'
      ? `${monthLabel} ${service}를 ${cycle} 일정으로 ${summary.completedCount}회 진행했습니다.`
      : `${monthLabel} ${service}를 ${summary.completedCount}회 진행했습니다.`,
  )

  // 담당자가 먼저 보는 건 '문제가 있었나, 처리됐나'다. 체류 시간보다 이걸 앞세운다.
  if (summary.issueCount > 0) {
    parts.push(
      summary.issueResolvedCount === summary.issueCount
        ? `접수된 요청 ${summary.issueCount}건은 모두 처리 완료했습니다.`
        : `접수된 요청 ${summary.issueCount}건 중 ${summary.issueResolvedCount}건을 처리했고, ` +
          `${summary.issueCount - summary.issueResolvedCount}건은 진행 중입니다.`,
    )
  } else {
    parts.push('접수된 요청이나 문제는 없었습니다.')
  }
  if (summary.siteNotes.length > 0) {
    parts.push(`문제가 되기 전에 미리 챙긴 것 ${summary.siteNotes.length}건은 아래에 정리했습니다.`)
  }

  return parts.join(' ')
}
