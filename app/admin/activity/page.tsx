import { getUsageOverview } from '@/lib/admin/activity'

// 항상 최신 사용 현황을 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

// 서울 기준 시각 표시 (예: 8월 8일 오후 3:20)
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

// "몇 분 전" 형태의 상대 시각 (마지막 사용 표시용)
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  return `${day}일 전`
}

export default async function AdminActivityPage() {
  const { feed, members, todayActiveCount, weekActiveCount, windowDays } = await getUsageOverview()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold">사용 현황</h1>
        <p className="text-xs text-muted-foreground">
          가입한 사장님들이 실제로 어떤 화면을 얼마나 쓰는지 봅니다 · 최근 {windowDays}일 · 본사 사용은 제외
        </p>
      </div>

      {/* 요약 지표 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-4">
          <div className="text-2xl font-bold">{todayActiveCount}</div>
          <div className="text-xs text-muted-foreground">오늘 사용한 업체</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="text-2xl font-bold">{weekActiveCount}</div>
          <div className="text-xs text-muted-foreground">최근 7일 사용 업체</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="text-2xl font-bold">{members.length}</div>
          <div className="text-xs text-muted-foreground">최근 {windowDays}일 사용 업체</div>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg border bg-background py-12 text-center text-sm text-muted-foreground">
          아직 쌓인 사용 기록이 없어요. 회원이 대시보드를 열면 여기에 표시됩니다.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 업체별 사용 요약 */}
          <section>
            <h2 className="mb-3 text-sm font-semibold">업체별 사용 (최근 사용 순)</h2>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.businessId} className="rounded-lg border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{m.businessName}</div>
                    <div className="whitespace-nowrap text-xs text-muted-foreground">
                      {m.lastSeenAt ? fmtRelative(m.lastSeenAt) : '-'}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    조회 {m.totalViews}회 · 사용한 날 {m.activeDays}일
                  </div>
                  {m.topSections.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.topSections.map((s) => (
                        <span
                          key={s.label}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {s.label} {s.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 실시간 활동 피드 */}
          <section>
            <h2 className="mb-3 text-sm font-semibold">최근 활동</h2>
            <div className="space-y-1.5">
              {feed.map((f, i) => (
                <div
                  key={`${f.businessId}-${f.at}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-medium">{f.businessName}</span>
                    <span className="text-muted-foreground"> · {f.section}</span>
                  </div>
                  <div className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(f.at)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
