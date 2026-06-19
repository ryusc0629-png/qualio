import { ImageResponse } from 'next/og'

// 아이폰 홈 화면 아이콘 — iOS는 SVG(manifest 아이콘)를 무시하므로 PNG가 따로 필요하다.
// 이 파일이 있으면 Next가 <link rel="apple-touch-icon">를 자동으로 넣어준다.
// iOS가 모서리를 자체적으로 둥글게 깎으므로, 꽉 찬 사각형(틸 배경 + 흰 Q)으로 만든다.
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
          background: '#059669',
          color: '#ffffff',
          fontSize: 120,
          fontWeight: 700,
        }}
      >
        Q
      </div>
    ),
    { ...size }
  )
}
