'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { BottomNav } from './bottom-nav'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'

interface DashboardShellProps {
  businessName: string
  children: React.ReactNode
}

// 대시보드 전체 레이아웃 — 모바일 사이드바 토글 상태 관리
export function DashboardShell({ businessName, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex">
      {/* 모바일 오버레이 배경 */}
      {sidebarOpen && (
        <>
          <ScrollLock />
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        </>
      )}

      {/* 사이드바 */}
      <Sidebar
        businessName={businessName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 상단 헤더 */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-white sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
              {/* 브랜드 마크 — 파비콘/앱아이콘과 동일한 기하학 Q */}
              <svg viewBox="0 0 512 512" className="w-4 h-4 text-primary-foreground" fill="none" stroke="currentColor" aria-hidden="true">
                <circle cx="250" cy="234" r="120" strokeWidth="46" />
                <line x1="306" y1="290" x2="384" y2="368" strokeWidth="46" strokeLinecap="round" />
              </svg>
            </div>
            <p className="font-semibold text-sm truncate">{businessName}</p>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 md:p-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* 모바일 하단 탭 — 더보기는 전체 메뉴(사이드바) 열기 */}
      <BottomNav onMore={() => setSidebarOpen(true)} />
    </div>
  )
}
