// 영업 파이프라인 로딩 스켈레톤
export default function PipelineLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 헤더 + 추가 버튼 */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded-lg" />
        <div className="h-10 w-28 bg-muted rounded-lg" />
      </div>

      {/* 파이프라인 단계 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
            <div className="h-3 w-16 bg-muted rounded" />
            <div className="h-7 w-8 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* 리드 카드 목록 */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="h-6 w-16 bg-muted rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
