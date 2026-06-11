import { Noto_Sans_KR } from 'next/font/google'

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
  return <div className={notoSansKR.className}>{children}</div>
}
