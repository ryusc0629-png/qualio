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

export interface ChecklistItem {
  id: string
  label: string
}

export interface MonthlySummary {
  completedCount: number
  upcomingCount: number
  /** 이번 달 예정분 대비 완료 비율(%) — 이미 지난 방문만 분모로 삼는다 */
  onTimeRate: number | null
  /** 도착~마감 기록이 있는 방문의 총 작업 시간(분) */
  totalMinutes: number
  /** 사진으로 확인된 작업 항목 — 많이 한 순 */
  taskCounts: { label: string; count: number }[]
  /** 현장에서 챙긴 것 — 날짜 + 내용 */
  siteNotes: { date: string; note: string }[]
  photoCount: number
  workerNames: string[]
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
  checklistItems: ChecklistItem[]
  workerNames: Map<string, string>
  photoCount: number
  /** 기준 시각(보통 지금) — '이미 지난 방문'을 가르는 선 */
  now: Date
}): MonthlySummary {
  const { visits, reports, checklistItems, workerNames, photoCount, now } = input

  const completed = visits.filter((v) => v.status === 'completed')
  const upcoming = visits.filter((v) => v.status !== 'completed')

  // 이행률 — 아직 안 온 날짜까지 분모에 넣으면 월초엔 항상 낮게 보여 오해를 준다
  const past = visits.filter((v) => new Date(v.scheduled_at) <= now)
  const pastCompleted = past.filter((v) => v.status === 'completed').length
  const onTimeRate = past.length > 0 ? Math.round((pastCompleted / past.length) * 100) : null

  const totalMinutes = completed.reduce((sum, v) => sum + durationMinutes(v.checkin_at, v.checkout_at), 0)

  // 작업 항목별 수행 횟수 — 직원이 항목마다 올린 사진이 곧 수행 증거
  const labelById = new Map(checklistItems.map((i) => [i.id, i.label]))
  const countByLabel = new Map<string, number>()
  for (const v of completed) {
    const photos = v.checklist_photos
    if (!photos || typeof photos !== 'object') continue
    for (const [itemId, urls] of Object.entries(photos)) {
      if (!Array.isArray(urls) || urls.length === 0) continue
      const label = labelById.get(itemId)
      if (!label) continue
      countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1)
    }
  }
  const taskCounts = Array.from(countByLabel.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'))

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

  return {
    completedCount: completed.length,
    upcomingCount: upcoming.length,
    onTimeRate,
    totalMinutes,
    taskCounts,
    siteNotes,
    photoCount,
    workerNames: names,
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

  if (summary.totalMinutes > 0) {
    parts.push(`현장에 머문 시간은 모두 ${formatDuration(summary.totalMinutes)}입니다.`)
  }
  if (summary.siteNotes.length > 0) {
    parts.push(`작업 중 확인한 특이사항 ${summary.siteNotes.length}건은 아래에 정리했습니다.`)
  }

  return parts.join(' ')
}
