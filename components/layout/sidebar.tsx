'use client'

import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  LogOut,
  Wrench,
  ClipboardList,
  Settings,
  Users,
  Megaphone,
  Handshake,
  CalendarDays,
  ShieldAlert,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarProps {
  businessName: string
  isOpen?: boolean
  onClose?: () => void
}

const navItems = [
  { href: '/dashboard',          label: '대시보드',    desc: undefined,        icon: LayoutDashboard, exact: true },
  { href: '/dashboard/clients',  label: '고객 관리',   desc: '견적·예약·거래처', icon: Users },
  { href: '/dashboard/schedule', label: '일정·배정',   desc: undefined,        icon: CalendarDays },
  { href: '/dashboard/claims',   label: '클레임',      desc: '미해결 관리',     icon: ShieldAlert },
  { href: '/dashboard/services', label: '서비스',      desc: undefined,        icon: Wrench },
  { href: '/dashboard/marketing',label: '마케팅',      desc: undefined,        icon: Megaphone },
  { href: '/dashboard/settings', label: '설정',        desc: undefined,        icon: Settings },
]

export function Sidebar({ businessName, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction()
    })
  }

  const isActive = (href: string, exact: boolean = false) => {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-56 border-r border-border bg-white flex flex-col h-screen transition-transform duration-200',
        'md:sticky md:top-0 md:translate-x-0 md:z-auto md:self-start',
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* 브랜드 헤더 */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <span className="text-primary-foreground text-sm font-bold">Q</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-primary tracking-wide">퀄리오</p>
            <p className="text-xs text-muted-foreground truncate leading-tight">{businessName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-md hover:bg-muted shrink-0"
          aria-label="메뉴 닫기"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground font-medium'
              )}
            >
              <item.icon
                className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
              />
              <div className="flex-1 min-w-0">
                <span className="block leading-tight">{item.label}</span>
                {item.desc && (
                  <span className={cn('block text-[10px] leading-tight mt-0.5', active ? 'text-primary/70' : 'text-muted-foreground/60')}>
                    {item.desc}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <div className="px-2 py-3 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 font-medium h-10"
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
