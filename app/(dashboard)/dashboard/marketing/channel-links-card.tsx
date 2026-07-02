'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Link2 } from 'lucide-react'
import { MARKETING_CHANNELS } from '@/lib/utils/marketing-channels'

interface ChannelLinksCardProps {
  // 채널 태그가 붙기 전의 기본 견적 페이지 주소 (예: https://qualio.co.kr/q/clean-house)
  baseUrl: string
}

// 채널별 전용 홍보 링크 — 사장님은 채널에 맞는 링크를 복사해 붙여넣기만 하면
// 대시보드 "채널별 유입"에 어느 채널에서 왔는지 정확히 집계됨
export function ChannelLinksCard({ baseUrl }: ChannelLinksCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const buildUrl = (key: string) => `${baseUrl}?ch=${key}`

  const handleCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(buildUrl(key))
      setCopiedKey(key)
      toast.success('링크를 복사했어요! 붙여넣기 하세요')
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000)
    } catch {
      toast.error('복사를 못 했어요. 링크를 길게 눌러 복사해주세요')
    }
  }

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="px-5 py-3 border-b bg-slate-50">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary shrink-0" />
          <p className="font-semibold text-sm">채널별 홍보 링크</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          채널마다 아래 전용 링크를 복사해 올리면, 어디서 고객이 왔는지 정확히 알 수 있어요
        </p>
      </div>

      <ul className="divide-y">
        {MARKETING_CHANNELS.map((ch) => {
          const copied = copiedKey === ch.key
          return (
            <li key={ch.key} className="px-4 py-3 flex items-center gap-3">
              <span className="text-lg shrink-0" aria-hidden>{ch.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{ch.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{ch.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(ch.key)}
                className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors ${
                  copied
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> 복사됨
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> 링크 복사
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <p className="px-5 py-3 border-t bg-slate-50/50 text-[11px] text-muted-foreground leading-relaxed">
        같은 견적 페이지지만 링크마다 꼬리표가 달라요. 채널별로 다른 링크를 써야 통계가 나뉩니다.
      </p>
    </div>
  )
}
