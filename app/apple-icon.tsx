import { ImageResponse } from 'next/og'

// 아이폰 홈 화면 아이콘 — iOS는 SVG(manifest 아이콘)를 무시하므로 PNG가 따로 필요하다.
// 이 파일이 있으면 Next가 <link rel="apple-touch-icon">를 자동으로 넣어준다.
// iOS가 모서리를 자체적으로 둥글게 깎으므로, 꽉 찬 사각형(에메랄드 그라데이션 + 입체 Q)으로 만든다.
// Satori는 feDropShadow 필터 지원이 불안정 → 어두운 Q를 아래 한 겹 깔아 음각/입체 효과를 낸다.
export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage:
            'linear-gradient(135deg, #065f46 0%, #059669 55%, #10b981 100%)',
        }}
      >
        {/* 상단 광택 오버레이 — 파비콘(icon.svg)의 sheen 값과 동일 (cx 30% / r 0.95 / 0.5→0.1→0) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage:
              'radial-gradient(95% 95% at 30% 0%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%)',
          }}
        />
        {/* 은은한 흰색 테두리 림 — 파비콘의 inset 스트로크(opacity 0.18)와 동일한 입체 마감 */}
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            width: 174,
            height: 174,
            borderRadius: 40,
            border: '2px solid rgba(255,255,255,0.18)',
          }}
        />
        <svg width="180" height="180" viewBox="0 0 512 512" fill="none">
          {/* 음각 그림자 Q */}
          <g
            transform="translate(0,9)"
            stroke="#022c22"
            strokeOpacity="0.35"
            strokeWidth="46"
            strokeLinecap="round"
          >
            <circle cx="250" cy="234" r="120" />
            <line x1="306" y1="290" x2="384" y2="368" />
          </g>
          {/* 흰 Q */}
          <g stroke="#ffffff" strokeWidth="46" strokeLinecap="round">
            <circle cx="250" cy="234" r="120" />
            <line x1="306" y1="290" x2="384" y2="368" />
          </g>
        </svg>
      </div>
    ),
    { ...size }
  )
}
