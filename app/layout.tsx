import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ScrollReset } from "@/components/ui/scroll-reset";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 검색엔진 사이트 소유 인증 코드 (구글 서치 콘솔 / 네이버 서치어드바이저).
// 값은 Vercel 환경변수로 주입 — 없으면 해당 태그를 렌더하지 않음.
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
const naverSiteVerification = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://qualio.co.kr"),
  title: "퀄리오 | 청소 업체 관리 솔루션",
  description: "동네 소형 청소 업체를 프리미엄 기업으로",
  verification: {
    ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
    ...(naverSiteVerification
      ? { other: { "naver-site-verification": naverSiteVerification } }
      : {}),
  },
};

// viewportFit: cover — 아이폰 노치/홈인디케이터 안전영역(env(safe-area-inset-*)) 활성화
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ScrollReset />
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
