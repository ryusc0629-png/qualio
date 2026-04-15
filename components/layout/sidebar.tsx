'use client'

import { useAction } from 'next-safe-action/hooks'
import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LayoutDashboard, LogOut, Wrench, FileText, Calendar } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarProps {
  businessName: string
}

export function Sidebar({ businessName }: SidebarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction()
    })
  }

  const navItems = [
    { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    { href: '/dashboard/services', label: '서비스', icon: Wrench },
    { href: '/dashboard/quotes', label: '견적', icon: FileText },
    { href: '/dashboard/bookings', label: '예약', icon: Calendar },
  ]

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-screen sticky top-0">
      {/* 업체명 */}
      <div className="p-5 border-b">
        <p className="font-bold text-lg truncate">{businessName}</p>
        <p className="text-xs text-muted-foreground mt-0.5">퀄리오 베타</p>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
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
