import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ScrollReset } from "@/components/ui/scroll-reset";
import { DeploymentSkewRecovery } from "@/components/ui/deployment-skew-recovery";
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
  title: "퀄리오 | 청소 업체 매출 올리는 솔루션",
  description: "견적·예약·홍보 자동화로 청소 업체의 새 매출을 만듭니다",
  // 퀄리오 아이콘은 여기서 '메타데이터'로 지정한다 — public/favicon.ico 를 가리킨다.
  // app/favicon.ico 로 두면 안 되는 이유: Next는 그 파일을 모든 페이지 <head>에 강제로 넣고
  // 하위 레이아웃이 지울 수 없다(문서: "Favicons can only be set in the root /app segment").
  // 그래서 고객사 홈페이지(/biz/...) 탭에도 퀄리오 아이콘이 같이 박혔다.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
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
        {/* 새 버전 배포로 열어둔 화면이 먹통이 되면 알려주고 새로 불러온다 */}
        <DeploymentSkewRecovery />
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
