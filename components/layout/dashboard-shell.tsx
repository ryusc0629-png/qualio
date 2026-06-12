'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from './sidebar'

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
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <Sidebar
        businessName={businessName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 상단 헤더 — 햄버거 버튼 */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-card sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-accent"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-semibold text-sm truncate">{businessName}</p>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
