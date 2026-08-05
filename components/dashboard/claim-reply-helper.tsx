'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { MessageSquareHeart, Copy, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateClaimRepliesAction } from '@/lib/actions/claims'

interface Props {
  claimId: string
}

const STAGES: { key: 'acknowledge' | 'resolve' | 'closing'; label: string; hint: string }[] = [
  { key: 'acknowledge', label: '1. 즉시 접수·사과', hint: '가장 먼저 보낼 첫마디' },
  { key: 'resolve', label: '2. 조치 안내', hint: '어떻게 해결할지' },
  { key: 'closing', label: '3. 마무리·재발 방지', hint: '조치 후 신뢰 회복' },
]

type Replies = { acknowledge: string; resolve: string; closing: string }

export function ClaimReplyHelper({ claimId }: Props) {
  const [replies, setReplies] = useState<Replies | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const { execute, isPending } = useAction(generateClaimRepliesAction, {
    onSuccess: ({ data }) => {
      if (data?.replies) setReplies(data.replies)
    },
    onError: () => toast.error('문구를 만들지 못했어요. 잠시 후 다시 시도해주세요'),
  })

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast.success('복사했어요 — 문자에 붙여넣으세요')
      setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      toast.error('복사하지 못했어요')
    }
  }

  return (
    <div className="border-t border-border pt-2 space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        onClick={() => execute({ claimId })}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <MessageSquareHeart className="h-4 w-4 mr-1.5" />}
        {replies ? '응대 문구 다시 만들기' : '고객 응대 문구 초안'}
      </Button>

      {replies && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            고객에게 문자·통화로 직접 전하세요. 상황에 맞게 이름·내용을 조금 손보면 더 좋아요.
          </p>
          {STAGES.map((s) => {
            const text = replies[s.key] ?? ''
            if (!text) return null
            const copied = copiedKey === s.key
            return (
              <div key={s.key} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{s.label}</span>
                  <button
                    type="button"
                    onClick={() => copy(s.key, text)}
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? '복사됨' : '복사'}
                  </button>
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{text}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
