'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props {
  title: string
  /** 헤더 제목 아래 한 줄 설명(선택) */
  description?: string
  /** 처음에 펼친 채로 시작할지 (기본: 접힘) */
  defaultOpen?: boolean
  /** 완성도 패널의 '채우기' 이동(jumpTo) 대상 id */
  id?: string
  children: React.ReactNode
}

/**
 * 설정 페이지 섹션을 접었다 펼 수 있는 카드.
 *
 * 왜 이렇게 쓰는가:
 *   - 설정 폼은 단일 <form> 하나에 모든 입력이 들어있고 일부는 FormData로 읽힌다.
 *     그래서 접을 때 조건부 렌더로 DOM에서 없애면(언마운트) 저장 시 값이 사라진다.
 *     네이티브 <details>는 접혀도 자식이 DOM에 남아(화면에서만 숨김) FormData가 그대로 잡힌다.
 *   - open을 useState로 제어하고 onToggle로 동기화한다. 제어 입력(onChange) 때문에 폼이
 *     매 타이핑마다 리렌더되는데, open을 상태로 들지 않으면 열림 상태가 리렌더에 튕겨 닫힌다.
 *   - jumpTo가 el.closest('details').open = true 로 여는 경우에도 toggle 이벤트→onToggle로 동기화된다.
 */
export function CollapsibleSection({ title, description, defaultOpen = false, id, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <details
      id={id}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-lg border bg-card"
    >
      <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="font-semibold text-sm">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 font-normal">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </summary>
      <div className="px-5 pb-5 pt-0 space-y-4">{children}</div>
    </details>
  )
}
