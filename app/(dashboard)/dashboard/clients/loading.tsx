// 고객 목록 로딩 스켈레톤
export default function ClientsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 헤더 + 추가 버튼 */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted rounded-lg" />
        <div className="h-10 w-28 bg-muted rounded-lg" />
      </div>

      {/* 검색 + 필터 */}
      <div className="flex gap-2">
        <div className="h-10 flex-1 bg-muted rounded-lg" />
        <div className="h-10 w-24 bg-muted rounded-lg" />
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-20 bg-muted rounded-lg" />
        ))}
      </div>

      {/* 고객 카드 목록 */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-muted rounded-full" />
                <div className="space-y-1.5">
                  <div className="h-4 w-28 bg-muted rounded" />
                  <div className="h-3 w-36 bg-muted rounded" />
                </div>
              </div>
              <div className="h-6 w-14 bg-muted rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
