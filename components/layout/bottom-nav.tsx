'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Users, Megaphone, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

// 모바일 하단 탭 — 엄지로 누르기 쉬운 주요 화면 4개 + 더보기(전체 메뉴)
// 데스크탑(md+)에선 사이드바를 쓰므로 숨김(md:hidden).
const tabs = [
  { href: '/dashboard',           label: '홈',     icon: LayoutDashboard, exact: true },
  { href: '/dashboard/schedule',  label: '일정',   icon: CalendarDays },
  { href: '/dashboard/clients',   label: '고객',   icon: Users },
  { href: '/dashboard/marketing', label: '마케팅', icon: Megaphone },
]

interface BottomNavProps {
  // "더보기" 탭 → 전체 메뉴(사이드바 드로어) 열기
  onMore: () => void
}

export function BottomNav({ onMore }: BottomNavProps) {
  const pathname = usePathname()

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border print:hidden"
      // 아이폰 홈 인디케이터 영역만큼 아래 여백 (viewportFit: cover와 함께 동작)
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = isActive(tab.href, tab.exact)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 h-14 active:bg-muted transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onMore}
          className="flex flex-col items-center justify-center gap-0.5 h-14 text-muted-foreground active:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">더보기</span>
        </button>
      </div>
    </nav>
  )
}
