// 리드 상세 로딩 스켈레톤
export default function LeadDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 뒤로가기 + 이름 */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-muted rounded-lg" />
        <div className="h-7 w-32 bg-muted rounded-lg" />
      </div>

      {/* 리드 정보 카드 */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-36 bg-muted rounded" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
          <div className="h-8 w-20 bg-muted rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 bg-muted rounded" />
              <div className="h-4 w-28 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        <div className="h-10 flex-1 bg-muted rounded-lg" />
        <div className="h-10 flex-1 bg-muted rounded-lg" />
      </div>
    </div>
  )
}
