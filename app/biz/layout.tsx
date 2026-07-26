import { Noto_Sans_KR } from 'next/font/google'
import { MetaPixel } from '@/components/meta-pixel'

// 한국어 전용 모던 폰트 — biz 공개 페이지에만 적용
const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export default function BizLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={notoSansKR.className}>
      {/* 광고 랜딩 방문자 전환 추적 — 히어로 인라인 폼의 Lead/CompleteRegistration 이벤트가 실제로 발화되려면 픽셀 베이스 코드가 로드돼야 함 (NEXT_PUBLIC_META_PIXEL_ID 있을 때만 동작) */}
      <MetaPixel />
      {children}
    </div>
  )
}
