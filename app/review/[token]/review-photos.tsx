'use client'

import { useEffect, useState } from 'react'
import { Download, Check } from 'lucide-react'
import { toast } from 'sonner'
import { PhotoGrid } from '@/components/ui/image-lightbox'

// 후기 페이지의 작업 전·후 사진.
//
// 왜 저장까지 붙이나:
// 고객이 네이버에 후기를 남길 때 사진을 함께 올리면 훨씬 잘 읽히고 오래 남는다.
// 그런데 고객 폰에는 그 사진이 없다 — 찍은 건 우리 직원이다.
// 여기서 바로 저장할 수 있게 해줘야 "사진 올려주세요"가 실제로 이뤄진다.
//
// ⚠️ 폰에서 '저장'의 현실 — 여기서 여러 번 헛짚었으니 정리해 둔다:
// - 아이폰: 여러 장을 한 번에 내려받는 게 사파리에서 사실상 막힌다(첫 장만 받고 조용히 끝난다).
//   게다가 버튼으로 받으면 '사진첩'이 아니라 '파일'에 들어가서 후기에 붙이기도 불편하다.
//   → 아이폰에서는 버튼을 아예 감추고 '꾹 눌러 저장'만 안내한다. 이게 사진첩으로 들어간다.
// - 안드로이드·PC: 한 번에 받기가 동작한다. 다만 브라우저가 연속 내려받기를 막으므로
//   사이에 간격을 두고, 진행 상황을 숫자로 보여준다.
// - blob 주소는 a.click() 직후에 회수하면 안 된다. 내려받기가 시작되기도 전에
//   주소가 사라져 조용히 실패한다.

interface Props {
  before: { url: string; caption: string }[]
  after: { url: string; caption: string }[]
  businessName: string
}

export function ReviewPhotos({ before, after, businessName }: Props) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(0)

  // 아이폰·아이패드에서는 '여러 장 한 번에 내려받기'가 사실상 동작하지 않는다.
  // 사파리가 첫 장만 받고 나머지를 조용히 막는다. 되지도 않는 버튼을 두면
  // 눌러보고 "안 되네" 하고 끝나므로, 여기서는 버튼을 감추고 꾹 눌러 저장만 안내한다.
  // (아이폰은 꾹 눌러 저장해야 '사진첩'에 들어가서 후기에 올리기도 편하다)
  const [isIos, setIsIos] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent
    setIsIos(/iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)))
  }, [])

  // 전·후 순서로 이어 붙인다. 현장에서 여러 장 찍었으면 다 보여줘야
  // 고객이 후기에 올릴 사진을 고를 수 있다.
  const photos = [...before, ...after]

  if (photos.length === 0) return null

  const saveAll = async () => {
    setSaving(true)
    setDone(0)
    let ok = 0
    try {
      for (const [i, p] of photos.entries()) {
        const res = await fetch(p.url)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${businessName}-${p.caption}-${i + 1}.jpg`
        a.click()
        // ⚠️ 바로 회수하면 안 된다 — 브라우저가 내려받기를 시작하기도 전에
        //    주소가 사라져 조용히 실패한다. 넉넉히 두고 지운다.
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        ok++
        setDone(ok)
        // 연달아 내려받으면 브라우저가 뒤엣것을 막는다 — 한 박자 쉬어준다
        if (i < photos.length - 1) await new Promise((r) => setTimeout(r, 700))
      }
      setSaved(true)
    } catch {
      toast.error('사진을 저장하지 못했어요. 사진을 꾹 눌러 저장해주세요')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {before.length > 0 && (
        <div className="text-left space-y-1.5">
          <p className="text-[11px] text-muted-foreground">작업 전</p>
          <PhotoGrid photos={before} columns={2} />
        </div>
      )}
      {after.length > 0 && (
        <div className="text-left space-y-1.5">
          <p className="text-[11px] text-primary font-medium">작업 후</p>
          <PhotoGrid photos={after} columns={2} />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        사진을 <b className="font-semibold text-foreground">꾹 눌러 저장</b>한 뒤 후기에 함께 올려주시면 큰 도움이 돼요
      </p>

      {/* 한 번에 내려받기 — 아이폰에서는 안 되므로 아예 안 보여준다 */}
      {!isIos && (
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="w-full h-10 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {photos.length}장 저장했어요
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              {saving ? `저장 중... ${done}/${photos.length}` : `사진 ${photos.length}장 한 번에 저장`}
            </>
          )}
        </button>
      )}
    </div>
  )
}
