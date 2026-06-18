// 설정 페이지 로딩 스켈레톤
export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse max-w-2xl">
      {/* 헤더 */}
      <div className="h-8 w-20 bg-muted rounded-lg" />

      {/* 설정 섹션 */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border bg-card p-5 space-y-4">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-10 w-full bg-muted rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-10 w-full bg-muted rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
