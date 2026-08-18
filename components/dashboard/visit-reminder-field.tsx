'use client'

import { Label } from '@/components/ui/label'
import { MessageCircle } from 'lucide-react'

// 정기계약마다 "방문 전날에 고객에게 카톡을 보낼까 말까"를 정하는 칸.
//
// 왜 기본이 '안 보내요'인가: 매주·매일 오는 거래처는 방문 요일을 이미 알고 있다.
// 거기에 매번 "내일 방문 예정이에요"를 보내면 안내가 아니라 소음이 된다.
// (실제로 주 5회 현장에 매 평일 발송되고 있었다) 간격이 긴 계약만 켜서 쓴다.

interface VisitReminderFieldProps {
  value: boolean // true = 방문 전날에 보내요
  onChange: (send: boolean) => void
}

export function VisitReminderField({ value, onChange }: VisitReminderFieldProps) {
  return (
    <div className="space-y-1">
      <Label>방문 전날 안내 카톡 (필수)</Label>
      <div className="grid grid-cols-2 gap-2">
        {[
          { option: false, title: '안 보내요', desc: '자주 가는 곳이라 매번 알릴 필요 없어요' },
          { option: true,  title: '보내요',   desc: '방문 하루 전 오전 10시에 자동으로 가요' },
        ].map((o) => {
          const on = value === o.option
          return (
            <button
              key={String(o.option)}
              type="button"
              onClick={() => onChange(o.option)}
              aria-pressed={on}
              className={`rounded-lg border p-3 text-left transition-colors ${
                on ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
              }`}
            >
              <p className="text-sm font-semibold">{o.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</p>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <MessageCircle className="h-3 w-3 shrink-0" />
        일회성 작업은 이 설정과 상관없이 전날 안내가 항상 나가요
      </p>
    </div>
  )
}
