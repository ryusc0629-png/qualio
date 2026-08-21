'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// 설명은 접어두고 한 줄만 보여준다.
//
// 왜 필요한가:
// 서비스 수정 화면이 안내 문단으로 꽉 차 있었다(2026-08-21 사장님 지적).
// 비테크 40~60대 사장님은 문단이 쌓여 있으면 읽기 전에 지쳐서, 정작 채워야 할 칸을
// 못 찾고 화면을 닫는다. 설명이 필요 없다는 뜻이 아니라 **필요할 때 펼쳐 봐야** 한다는 뜻이다.
//
// 규칙: 접힌 상태에서 보이는 한 줄만으로 '지금 뭘 하는 칸인지'가 끝나야 한다.
//       펼쳐야 알 수 있는 내용이면 그건 접으면 안 되는 내용이다.

interface HelpNoteProps {
  /** 접혀 있을 때도 항상 보이는 한 줄 — 이것만 읽어도 뭘 하는지 알아야 한다 */
  summary: React.ReactNode
  /** 펼쳤을 때 나오는 자세한 설명 */
  children: React.ReactNode
  /** 펼치기 버튼 문구 */
  moreLabel?: string
  /** 처음부터 펼쳐둘지 (기본: 접힘) */
  defaultOpen?: boolean
  /** 강조 색 — 초록(도움말) / 노랑(주의) */
  tone?: 'info' | 'warn'
}

export function HelpNote({
  summary,
  children,
  moreLabel = '자세히',
  defaultOpen = false,
  tone = 'info',
}: HelpNoteProps) {
  const [open, setOpen] = useState(defaultOpen)

  const toneClass =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-primary/25 bg-primary/5 text-foreground/80'

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{summary}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium opacity-70 hover:opacity-100"
        >
          {open ? '접기' : moreLabel}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && <div className="mt-2 pt-2 border-t border-current/10 space-y-1.5">{children}</div>}
    </div>
  )
}
