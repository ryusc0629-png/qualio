import type { MetadataRoute } from 'next'

// PWA 매니페스트 — "홈 화면에 추가" + 앱 푸시 알림을 가능하게 함
// 아이폰은 이 매니페스트가 있어야 홈 화면에 설치되고, 설치돼야 푸시가 온다 (iOS 16.4+)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '퀄리오 — 청소 업체 운영 도구',
    short_name: '퀄리오',
    description: '견적·예약·고객 관리를 한 곳에서. 새 견적·일정 알림을 폰으로 바로 받기.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#059669',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
