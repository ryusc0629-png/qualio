// 온보딩 레이아웃 — 심플 중앙 정렬 (사이드바 없음)
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {children}
    </div>
  )
}
