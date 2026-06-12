import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// 인증 페이지 레이아웃 (사이드바 없이 중앙 정렬)
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* 상단 홈 링크 */}
      <div className="p-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          홈으로
        </Link>
      </div>

      {/* 중앙 정렬 콘텐츠 */}
      <div className="flex-1 flex items-center justify-center px-4">
        {children}
      </div>
    </div>
  )
}
