'use client'

import { useState } from 'react'
import { MapPin, Navigation, ChevronDown } from 'lucide-react'

// 주소를 카카오맵/네이버맵/티맵 중 골라서 길찾기로 여는 버튼.
// 좌표가 아니라 주소 텍스트만 있으므로 각 앱에서 "주소 검색"으로 연다.
// - 카카오맵/네이버맵: 웹 URL (앱 있으면 앱으로, 없으면 웹) → 새 탭
// - 티맵: 앱 스킴(설치 시 앱 실행) → 같은 창에서 트리거
const MAP_APPS: { name: string; href: (addr: string) => string; newTab: boolean }[] = [
  {
    name: '카카오맵',
    href: (a) => `https://map.kakao.com/?q=${encodeURIComponent(a)}`,
    newTab: true,
  },
  {
    name: '네이버맵',
    href: (a) => `https://map.naver.com/v5/search/${encodeURIComponent(a)}`,
    newTab: true,
  },
  {
    name: '티맵',
    href: (a) => `tmap://search?name=${encodeURIComponent(a)}`,
    newTab: false,
  },
]

interface MapNavButtonProps {
  address: string
}

export function MapNavButton({ address }: MapNavButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 h-11 text-sm active:bg-muted transition-colors"
      >
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 min-w-0 truncate text-left font-medium">{address}</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-primary shrink-0">
          <Navigation className="h-3.5 w-3.5" />
          길찾기
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="grid grid-cols-3 gap-2 border-t border-border bg-muted/30 p-2">
          {MAP_APPS.map((m) => (
            <a
              key={m.name}
              href={m.href(address)}
              target={m.newTab ? '_blank' : undefined}
              rel={m.newTab ? 'noopener noreferrer' : undefined}
              onClick={() => setOpen(false)}
              className="flex h-11 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium active:bg-muted transition-colors"
            >
              {m.name}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
