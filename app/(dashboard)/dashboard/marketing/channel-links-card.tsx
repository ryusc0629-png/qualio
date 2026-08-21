'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Link2, Download, ExternalLink } from 'lucide-react'
import { MARKETING_CHANNELS } from '@/lib/utils/marketing-channels'

interface ChannelLinksCardProps {
  // 채널 태그가 붙기 전의 기본 홈페이지 주소 (예: https://qualio.co.kr/biz/clean-house)
  // 모든 채널을 랜딩(/biz)으로 보냄 — 랜딩이 신뢰를 준 뒤 견적 버튼(?ch= 전달)으로 이어져 통계도 유지됨
  baseUrl: string
  // 인쇄물 채널의 QR 그림(data URL) — 서버에서 미리 만들어 넘긴다. { flyer: '...', proposal: '...' }
  qrByChannel?: Record<string, string>
}

// 채널별 전용 홍보 링크 — 사장님은 채널에 맞는 링크를 복사해 붙여넣기만 하면
// 대시보드 "채널별 유입"에 어느 채널에서 왔는지 정확히 집계됨
export function ChannelLinksCard({ baseUrl, qrByChannel = {} }: ChannelLinksCardProps) {
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
          const qr = ch.needsQr ? qrByChannel[ch.key] : undefined
          return (
            <li key={ch.key} className="px-4 py-3 flex items-center gap-3">
              {/* 인쇄물 채널은 QR 그림 자체가 아이콘 역할 — 뭘 받는지 눈으로 보인다 */}
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`${ch.label} QR`} className="h-11 w-11 rounded border bg-white shrink-0" />
              ) : (
                <span className="text-lg shrink-0" aria-hidden>{ch.emoji}</span>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{ch.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{ch.hint}</p>
                {/* 링크를 어디에 붙이는지 — 그 자리로 바로 열어준다 */}
                {ch.manageUrl && (
                  <a
                    href={ch.manageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline mt-0.5"
                  >
                    <ExternalLink className="h-3 w-3" />붙여넣으러 가기
                  </a>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* 인쇄물은 링크를 복사해봐야 종이에 못 붙인다 — QR 그림을 바로 내려받게 한다 */}
                {qr && (
                  <a
                    href={qr}
                    download={`${ch.label}.png`}
                    className="h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />QR 저장
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(ch.key)}
                  className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    copied
                      ? 'bg-emerald-100 text-emerald-700'
                      : qr
                        ? 'bg-white border text-slate-600 hover:bg-slate-50'
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
              </div>
            </li>
          )
        })}
      </ul>

      <p className="px-5 py-3 border-t bg-slate-50/50 text-[11px] text-muted-foreground leading-relaxed">
        링크마다 채널 꼬리표가 달라요. 채널별로 다른 링크를 써야 어디서 고객이 왔는지 통계가 나뉩니다.
      </p>
    </div>
  )
}
