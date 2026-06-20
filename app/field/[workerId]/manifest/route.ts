// 직원·도급사 현장 앱 전용 PWA 매니페스트.
// 전역 매니페스트(start_url=/dashboard)와 달리, 홈 화면에 추가하면 그 직원의 현장 앱으로 열리도록
// start_url·scope를 /field/[workerId]로 지정한다.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const { workerId } = await params

  const manifest = {
    name: '퀄리오 현장 — 오늘 일정',
    short_name: '퀄리오 현장',
    description: '오늘 일정·작업·클레임 처리 요청을 폰으로 바로 확인하세요.',
    start_url: `/field/${workerId}`,
    scope: `/field/${workerId}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#059669',
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
