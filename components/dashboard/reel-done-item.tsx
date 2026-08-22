'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Play, SkipForward, Copy, Check } from 'lucide-react'
import { ReelShareButtons } from './reel-share-buttons'
import { dismissReelAction } from '@/lib/actions/reports'

// 완성된 홍보 영상 한 편. 보고 · 올리고 · 치우는 것까지 이 자리에서 끝난다.
//
// ⚠️예전엔 같은 릴스가 마케팅 화면에 두 번 나왔다. 위쪽 '홍보 영상' 카드엔 올리기·내려받기가,
//   아래쪽 '올려야 할 작업물' 허브엔 미리보기·건너뛰기가 따로 있었다. 영상을 확인하려면
//   아래로 내려가 '미리보기'를 누르고, 올리려면 다시 위로 올라와야 했다.
//   ⛔릴스를 두 곳에 그리지 말 것 — 같은 것이 두 번 보이면 어느 쪽이 진짜인지 헷갈린다.

interface Props {
  reportId: string
  url: string
  label: string
  /** 어디서 만든 영상인가 — 시공 사례로 만든 것은 '치우기'가 아직 없다 */
  source?: 'report' | 'portfolio'
  /** 인스타에 그대로 붙여넣을 캡션(해시태그 포함). 없으면 버튼을 안 그린다 */
  caption?: string
}

export function ReelDoneItem({ reportId, url, label, source = 'report', caption }: Props) {
  // 썸네일을 누르면 그 자리에서 큰 화면으로 재생된다 — '미리보기' 버튼을 따로 찾을 필요가 없다
  const [playing, setPlaying] = useState(false)
  const [copied, setCopied] = useState(false)

  // 영상만 있으면 사장님이 올릴 때 글을 직접 써야 한다. 캡션까지 손에 쥐여준다.
  const copyCaption = async () => {
    if (!caption) return
    try {
      await navigator.clipboard.writeText(caption)
      setCopied(true)
      toast.success('캡션을 복사했어요. 인스타에 붙여넣으세요')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사하지 못했어요. 아래 글을 길게 눌러 복사해주세요')
    }
  }

  const { execute: dismiss, isPending: isDismissing } = useAction(dismissReelAction, {
    onSuccess: () => toast.success('목록에서 치웠어요'),
    onError: () => toast.error('치우지 못했어요. 다시 눌러주세요'),
  })

  return (
    <div className="rounded-lg border p-3 space-y-3">
      {playing ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          className="w-full rounded-lg aspect-[9/16] bg-black object-contain max-h-[360px]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="flex items-center gap-3 w-full text-left"
        >
          {/* 첫 장면 + 재생 표시 — 눌러서 볼 수 있다는 걸 그림으로 알린다 */}
          <div className="relative w-16 h-24 shrink-0">
            <video
              src={url}
              className="w-16 h-24 rounded-lg object-cover bg-muted"
              preload="metadata"
              muted
              playsInline
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/25">
              <Play className="h-5 w-5 text-white fill-white" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{label}</p>
            <p className="text-xs text-emerald-600 mt-0.5">올릴 준비가 됐어요</p>
            <p className="text-xs text-muted-foreground mt-0.5">눌러서 영상 보기</p>
          </div>
        </button>
      )}

      <ReelShareButtons url={url} label={label} />

      {caption && (
        <button
          type="button"
          onClick={copyCaption}
          className="w-full flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-medium border bg-white hover:bg-muted transition-colors"
        >
          {copied ? <><Check className="h-4 w-4 text-emerald-600" />복사했어요</> : <><Copy className="h-4 w-4" />올릴 글 복사하기</>}
        </button>
      )}

      {source === 'report' && (
      <button
        type="button"
        disabled={isDismissing}
        onClick={() => {
          if (confirm('이 영상을 목록에서 치울까요?\n\n영상은 그대로 있고 목록에서만 사라져요.')) {
            dismiss({ reportId })
          }
        }}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
      >
        <SkipForward className="h-3 w-3" />
        다 올렸어요 · 목록에서 치우기
      </button>
      )}
    </div>
  )
}
