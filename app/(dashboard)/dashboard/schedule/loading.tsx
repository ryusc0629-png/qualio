// 일정 캘린더 로딩 스켈레톤
export default function ScheduleLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted rounded-lg" />
        <div className="flex gap-2">
          <div className="h-10 w-10 bg-muted rounded-lg" />
          <div className="h-10 w-32 bg-muted rounded-lg" />
          <div className="h-10 w-10 bg-muted rounded-lg" />
        </div>
      </div>

      {/* 캘린더 그리드 */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-4 bg-muted rounded mx-auto w-8" />
          ))}
        </div>
        {/* 날짜 셀 */}
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="grid grid-cols-7 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((col) => (
              <div key={col} className="h-16 bg-muted/50 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
