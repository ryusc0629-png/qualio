// 고객 상세 로딩 스켈레톤
export default function CustomerDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 뒤로가기 + 이름 */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-muted rounded-lg" />
        <div className="h-7 w-36 bg-muted rounded-lg" />
      </div>

      {/* 고객 정보 카드 */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 bg-muted rounded-full" />
          <div className="space-y-2">
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-3 w-28 bg-muted rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* 예약/계약 이력 */}
      <div className="space-y-3">
        <div className="h-5 w-24 bg-muted rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
            <div className="h-6 w-14 bg-muted rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
