import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "퀄리오 | 청소 업체 관리 솔루션",
  description: "동네 소형 청소 업체를 프리미엄 기업으로",
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
