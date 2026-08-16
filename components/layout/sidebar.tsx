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
  CalendarDays,
  Wallet,
  BadgeDollarSign,
  ShieldCheck,
  X,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface SidebarProps {
  businessName: string
  isAdmin?: boolean
  isOpen?: boolean
  onClose?: () => void
}

// 자주 쓰는 순서로 정렬 (사장님 사용 빈도 기준)
const navItems = [
  { href: '/dashboard',          label: '홈',          desc: undefined,        icon: LayoutDashboard, exact: true },
  { href: '/dashboard/schedule', label: '일정·배정',   desc: undefined,        icon: CalendarDays },
  // '문단속·출퇴근'은 사이드바에서 내림 — 매일 여는 목적지가 아니라 '문제 있을 때만' 보는
  // 알림성 화면. 진입은 홈 '오늘 현장 현황' 카드 + 일정·배정 상단 링크(/dashboard/attendance)로.
  { href: '/dashboard/marketing',label: '마케팅',      desc: undefined,        icon: Megaphone },
  { href: '/dashboard/clients',  label: '고객 관리',   desc: '상담·견적·거래처', icon: Users },
  { href: '/dashboard/finance',  label: '매출·지출',   desc: '손익·본전 계산',   icon: Wallet },
  { href: '/dashboard/payroll',  label: '급여',        desc: '근태 기반 급여·명세서', icon: BadgeDollarSign },
  // '영업 동선'(콜드 개척 방문 동선)은 제품에서 내림 — 퀄리오는 '리드가 들어온 순간부터'의
  // 인바운드 자동화에 집중. 페이지·액션·lib/roadmap 코드는 잠재워 둠(되살리려면 이 줄 복구).
  // { href: '/dashboard/roadmap',  label: '영업 동선',   desc: '방문 순서 최적화', icon: Route },
  { href: '/dashboard/services', label: '서비스',      desc: undefined,        icon: Wrench },
  { href: '/dashboard/settings', label: '설정',        desc: undefined,        icon: Settings },
]

export function Sidebar({ businessName, isAdmin = false, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction()
      // 세션 삭제 후 완전 새로고침으로 이동 — 서버 컴포넌트 캐시까지 비워 확실히 로그아웃 상태로 진입
      window.location.replace('/login')
    })
  }

  const isActive = (href: string, exact: boolean = false) => {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className={cn(
        // h-dvh(100vh 아님): 모바일 브라우저는 100vh가 주소창·툴바에 가려진 영역까지 포함해서
        // 실제 보이는 화면보다 길다. 그래서 h-screen이면 맨 아래 로그아웃 버튼이 화면 밖으로
        // 밀려나 아예 누를 수 없었다. h-dvh는 지금 보이는 높이라 항상 화면 안에 들어온다.
        'fixed inset-y-0 left-0 z-50 w-56 border-r border-border bg-white flex flex-col h-dvh transition-transform duration-200',
        'md:sticky md:top-0 md:translate-x-0 md:z-auto md:self-start',
        'print:hidden', // PDF 저장(인쇄) 시 사이드바 제외
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* 브랜드 헤더 */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 브랜드 마크 — 공식 퀄리오 아이콘(파비콘/앱아이콘과 동일 파일) */}
          <Image
            src="/qualio-icon.png"
            alt="퀄리오"
            width={32}
            height={32}
            priority
            className="w-8 h-8 shrink-0"
          />
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

      {/* 네비게이션 — 메뉴가 길어지면 여기만 스크롤되고 아래 로그아웃은 항상 붙어 있는다 */}
      <nav className="flex-1 min-h-0 px-2 py-3 space-y-0.5 overflow-y-auto overscroll-contain">
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

      {/* 본사 관리자(관리자 계정에만 노출) + 로그아웃 */}
      {/* 아이폰 홈 인디케이터에 버튼이 가리지 않도록 아래 안전영역만큼 여백 확보 */}
      <div
        className="shrink-0 px-2 py-3 border-t border-border space-y-0.5"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {isAdmin && (
          <Link
            href="/admin"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>본사 관리자</span>
          </Link>
        )}
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
