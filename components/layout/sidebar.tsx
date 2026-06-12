'use client'

import { useAction } from 'next-safe-action/hooks'
import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LayoutDashboard, LogOut, Wrench, FileText, Calendar, Settings, Users, Megaphone, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarProps {
  businessName: string
  isOpen?: boolean       // 모바일에서 열림 여부
  onClose?: () => void   // 모바일에서 닫기 콜백
}

export function Sidebar({ businessName, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction()
    })
  }

  const navItems = [
    { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    { href: '/dashboard/clients', label: '클라이언트', icon: Users },
    { href: '/dashboard/services', label: '서비스', icon: Wrench },
    { href: '/dashboard/quotes', label: '견적', icon: FileText },
    { href: '/dashboard/bookings', label: '예약', icon: Calendar },
    { href: '/dashboard/marketing', label: '마케팅', icon: Megaphone },
    { href: '/dashboard/settings', label: '설정', icon: Settings },
  ]

  return (
    <aside
      className={cn(
        // 모바일: fixed drawer (기본 숨김, isOpen 시 슬라이드인)
        'fixed inset-y-0 left-0 z-50 w-64 border-r bg-card flex flex-col h-screen transition-transform duration-200',
        'md:relative md:translate-x-0 md:z-auto',  // PC: 항상 표시
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* 업체명 + 모바일 닫기 버튼 */}
      <div className="p-5 border-b flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-bold text-lg truncate">{businessName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">퀄리오</p>
        </div>
        {/* 모바일에서만 표시 */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-md hover:bg-accent shrink-0"
          aria-label="메뉴 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}  // 모바일에서 메뉴 선택 시 사이드바 닫기
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* 하단 로그아웃 */}
      <div className="p-3 border-t">
        <Separator className="mb-3" />
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
          disabled={isPending}
        >
          <LogOut className="h-4 w-4" />
          {isPending ? '로그아웃 중...' : '로그아웃'}
        </Button>
      </div>
    </aside>
  )
}
