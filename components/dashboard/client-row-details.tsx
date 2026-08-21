'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface ClientRowDetailsProps {
  /** 접힌 상태에서도 보여줄 한 줄 (마지막 방문·다음 연락 등). '자세히'와 같은 줄에 붙는다. */
  summary?: React.ReactNode
  /** 펼칠 내용이 있는지 — 없으면 '자세히' 버튼을 아예 안 그린다(누를 게 없는 버튼 금지) */
  hasDetails?: boolean
  children?: React.ReactNode
}

// 고객 목록 카드의 '자세히' 접기 — 평소엔 이름·상태·금액만 보이고, 눌렀을 때만 펼친다.
//
// 왜: 고객이 쌓일수록 목록이 길어지는 게 문제인데, 카드 한 장이 네 줄(이름·전화·주소·계약)이라
// 한 화면에 예닐곱 곳밖에 안 들어갔다. 사장님이 목록을 훑을 때 필요한 건 '누가 어디까지 갔나'이지
// 주소가 아니다. 전화는 이름 옆 수화기 버튼으로 바로 걸 수 있으니 번호 텍스트도 접어도 된다.
//
// ⚠️ summary를 버튼과 같은 줄에 붙이는 게 핵심 — 따로 그리면 접어도 줄 수가 그대로라 접은 의미가 없다.
// ⚠️ 서버 컴포넌트(page.tsx)에서 children으로 넘겨 쓴다 — 안에 든 수정·삭제 버튼은 그대로 동작한다.
export function ClientRowDetails({ summary, hasDetails = true, children }: ClientRowDetailsProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 flex-wrap">
        {summary}
        {hasDetails && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {open ? '접기' : '자세히'}
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {hasDetails && open && <div className="mt-1.5 space-y-0.5">{children}</div>}
    </div>
  )
}
