'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AdminNavCounts } from '@/lib/admin/nav-counts'

interface Props {
  counts: AdminNavCounts
}

interface NavItem {
  href: string
  label: string
  /** 처리할 일 개수 — 0이면 배지를 숨긴다 */
  count?: number
}

interface NavGroup {
  title: string
  hint: string
  items: NavItem[]
}

// 메뉴를 성격으로 묶는다.
// '오늘 할 일'은 손이 가야 끝나는 것(쌓이면 숫자가 뜬다), 나머지는 보기만 하는 것.
// 나중에 직원이 이 화면을 쓰게 되면 위에서 아래로 훑는 순서가 곧 하루 업무 순서가 된다.
function buildGroups(counts: AdminNavCounts): NavGroup[] {
  return [
    {
      title: '오늘 할 일',
      hint: '손이 가야 끝나는 것',
      items: [
        { href: '/admin/requests', label: '대행 요청', count: counts.requests },
        { href: '/admin/domain-outreach', label: '주소 권유', count: counts.domainOutreach },
        { href: '/admin/onboarding-gaps', label: '첫 세팅 미완', count: counts.onboardingGaps },
        { href: '/admin/bug-reports', label: '오류 신고', count: counts.bugReports },
        { href: '/admin/refunds', label: '환불 처리' },
        { href: '/admin/academy-inquiries', label: '학원 제휴', count: counts.academyInquiries },
      ],
    },
    {
      title: '고객',
      hint: '누가 어떻게 쓰고 있나',
      items: [
        { href: '/admin/businesses', label: '회원 목록' },
        { href: '/admin/activity', label: '사용 현황' },
      ],
    },
    {
      title: '숫자',
      hint: '잘 되고 있나',
      items: [
        { href: '/admin', label: '핵심 지표' },
        { href: '/admin/growth', label: '그로스' },
        { href: '/admin/finance', label: '재무' },
      ],
    },
    {
      title: '콘텐츠',
      hint: '내보내는 것',
      items: [{ href: '/admin/lessons', label: 'OPS 강의' }],
    },
  ]
}

export function AdminNav({ counts }: Props) {
  const pathname = usePathname()
  const groups = buildGroups(counts)

  // '/admin'은 하위 경로 전부와 앞부분이 겹치므로 완전히 같을 때만 현재 메뉴로 본다
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))

  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="px-2 pb-1.5">
            <p className="text-[11px] font-semibold text-foreground">{group.title}</p>
            <p className="text-[10px] text-muted-foreground">{group.hint}</p>
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-emerald-50 font-medium text-emerald-700'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span>{item.label}</span>
                    {!!item.count && item.count > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800">
                        {item.count}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="border-t pt-3">
        <Link
          href="/dashboard"
          className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          내 대시보드로 →
        </Link>
      </div>
    </nav>
  )
}
