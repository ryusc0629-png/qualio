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

      {/* 메인 콘텐츠 — 모바일은 상단 바 없이 본문을 꽉 채움 (업체명은 홈 인사말로 표시) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일은 노치/상태바 안전영역만큼 위 여백, 데스크탑은 일반 패딩 */}
        <main className="flex-1 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24 md:p-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* 모바일 하단 탭 — 더보기는 전체 메뉴(사이드바) 열기 */}
      <BottomNav onMore={() => setSidebarOpen(true)} />
    </div>
  )
}
