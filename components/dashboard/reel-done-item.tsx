'use client'

import { useEffect, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Play, SkipForward, Download, Share2, Loader2, ExternalLink } from 'lucide-react'
import { dismissReelAction } from '@/lib/actions/reports'
import type { ReelChannelCaption } from '@/lib/reel/channel-captions'

// 완성된 홍보 영상 한 편. 보고 · 저장하고 · 채널마다 올리고 · 치우는 것까지 이 자리에서 끝난다.
//
// ⚠️예전엔 같은 릴스가 마케팅 화면에 두 번 나왔다(위 카드/아래 허브).
//   ⛔릴스를 두 곳에 그리지 말 것 — 같은 것이 두 번 보이면 어느 쪽이 진짜인지 헷갈린다.
//
// ★동선은 두 단계로 고정한다: ①영상을 기기에 저장 → ②채널을 골라 문구 복사 + 그 채널 열기.
//   순서가 뒤집히면(채널 먼저 열기) 올릴 파일이 없어서 되돌아와야 한다.

interface Props {
  reportId: string
  url: string
  label: string
  /** 어디서 만든 영상인가 — 시공 사례로 만든 것은 '치우기'가 아직 없다 */
  source?: 'report' | 'portfolio'
  /** 채널별 문구. 없으면 채널 줄을 안 그린다 */
  captions?: ReelChannelCaption[]
}

export function ReelDoneItem({ reportId, url, label, source = 'report', captions = [] }: Props) {
  // 썸네일을 누르면 그 자리에서 큰 화면으로 재생된다 — '미리보기' 버튼을 따로 찾을 필요가 없다
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // ⚠️맥·PC에는 인스타 앱이 없다. 그래서 '인스타에 올리기'를 누르면 에어드롭·메일만 있는
  //   공유창이 떠서 "왜 공유가 뜨지?"가 된다(2026-08-22 대표 확인). 폰에서만 공유를 권하고
  //   PC에서는 '영상 저장하기'를 주 버튼으로 둔다.
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    setIsPhone(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && typeof navigator.share === 'function')
  }, [])

  const { execute: dismiss, isPending: isDismissing } = useAction(dismissReelAction, {
    onSuccess: () => toast.success('목록에서 치웠어요'),
    onError: () => toast.error('치우지 못했어요. 다시 눌러주세요'),
  })

  const fileName = `${label.replace(/[^\p{L}\p{N}]+/gu, '-')}.mp4`

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileName
      a.click()
      URL.revokeObjectURL(objectUrl)
      toast.success('영상을 저장했어요')
    } catch (err) {
      console.error('[Reel] 저장 실패:', err)
      window.open(url, '_blank', 'noopener')
    } finally {
      setSaving(false)
    }
  }

  // 폰에서만 — 공유창에 인스타·틱톡 앱이 뜬다
  const shareToApps = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: label })
        return
      }
      await save()
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'InvalidStateError')) return
      console.error('[Reel] 공유 실패:', err)
      toast.error('보내지 못했어요. 아래 저장하기를 눌러주세요')
    } finally {
      setSharing(false)
    }
  }

  // 채널 하나를 누르면 문구를 복사하고 그 채널을 연다 — 한 번 누르면 할 일이 끝난다
  const goChannel = async (c: ReelChannelCaption) => {
    try {
      await navigator.clipboard.writeText(c.text)
      setCopiedKey(c.key)
      setTimeout(() => setCopiedKey(null), 2500)
      // 어디에 어떻게 올리는지는 누르는 순간에 알려준다 — 화면에 상시로 깔면 글자 벽이 된다.
      // (네이버 클립처럼 경로가 안 뻔한 채널은 이 한 줄이 없으면 사장님이 헤맨다)
      toast.success(`${c.label} 문구를 복사했어요`, { description: c.hint, duration: 6000 })
    } catch {
      toast.warning('문구 복사가 안 됐어요. 채널을 연 뒤 다시 눌러주세요')
    }

    // ★폰에서 앱으로 넘기려면 **같은 탭으로 이동**해야 한다.
    //   새 탭(window.open)으로 열면 iOS·안드로이드가 App Links를 안 걸어 브라우저에 머문다.
    //   ⚠️떠나기 전에 안내를 읽을 시간을 준다 — 바로 넘어가면 '글쓰기(+) → 클립'을 못 보고
    //     앱만 열린 채 사장님이 뭘 눌러야 할지 모른다.
    if (isPhone && c.preferApp) {
      setTimeout(() => { window.location.href = c.openUrl }, 1800)
      return
    }
    window.open(c.openUrl, '_blank', 'noopener')
  }

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
        <button type="button" onClick={() => setPlaying(true)} className="flex items-center gap-3 w-full text-left">
          <div className="relative w-16 h-24 shrink-0">
            <video src={url} className="w-16 h-24 rounded-lg object-cover bg-muted" preload="metadata" muted playsInline />
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

      {/* ① 영상을 기기에 저장 — 이게 있어야 어느 채널에든 올릴 수 있다 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-white bg-primary hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" />저장 중...</> : <><Download className="h-4 w-4" />영상 저장하기</>}
        </button>
        {isPhone && (
          <button
            type="button"
            onClick={shareToApps}
            disabled={sharing}
            className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium border bg-white hover:bg-muted disabled:opacity-60 transition-colors"
          >
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            앱으로 보내기
          </button>
        )}
      </div>

      {/* ② 채널 고르기 — 누르면 그 채널 문구가 복사되고 채널이 열린다 */}
      {captions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            저장한 뒤 올릴 곳을 누르세요. 문구는 자동으로 복사돼요
          </p>
          {/* 네이버 클립만 경로가 안 뻔하다 — 나머지 셋은 눌러보면 아는 동작이라 안 적는다 */}
          {captions.some((c) => c.key === 'naver_clip') && (
            <p className="text-[11px] text-muted-foreground">
              네이버 클립은 <b>블로그 앱</b>에서 글쓰기(+) → <b>클립</b>으로 올려요
            </p>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {captions.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => goChannel(c)}
                className={`h-11 px-2 rounded-lg border text-xs font-medium transition-colors ${
                  copiedKey === c.key ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'bg-white hover:bg-muted'
                }`}
                title={c.hint}
              >
                <span className="inline-flex items-center gap-1">
                  {copiedKey === c.key ? '복사됐어요' : c.label}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </span>
              </button>
            ))}
          </div>
        </div>
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
