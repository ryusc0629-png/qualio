// 그로스 탭 클릭 즉시 보이는 로딩 화면 — 외부 API 응답을 기다리는 동안 멈춘 것처럼 보이지 않게 한다
export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">그로스 콘솔 · 채널 성과</h1>
        <p className="mt-1 text-sm text-muted-foreground">청소업의 모든 것 — 채널 성과를 불러오는 중이에요…</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
