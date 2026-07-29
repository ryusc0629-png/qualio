'use client'

import { Phone } from 'lucide-react'

interface CallLinkProps {
  phone: string
  className?: string
  iconClassName?: string
}

// 목록 행이 <Link>로 감싸진 경우, 전화 아이콘을 눌러도 상세 페이지로 이동하지 않고
// 전화 걸기만 되도록 stopPropagation 처리하는 클라이언트 전용 링크.
// (서버 컴포넌트에서는 onClick을 넘길 수 없어 별도 클라이언트 컴포넌트로 분리)
export function CallLink({ phone, className, iconClassName }: CallLinkProps) {
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => e.stopPropagation()}
      className={className ?? 'w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center hover:bg-violet-200 transition-colors'}
      aria-label="전화 걸기"
    >
      <Phone className={iconClassName ?? 'h-3.5 w-3.5 text-violet-600'} />
    </a>
  )
}
