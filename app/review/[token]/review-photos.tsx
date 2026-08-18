'use client'

import { useState } from 'react'
import { Download, Check } from 'lucide-react'
import { PhotoGrid } from '@/components/ui/image-lightbox'

// 후기 페이지의 작업 전·후 사진.
//
// 왜 저장까지 붙이나:
// 고객이 네이버에 후기를 남길 때 사진을 함께 올리면 훨씬 잘 읽히고 오래 남는다.
// 그런데 고객 폰에는 그 사진이 없다 — 찍은 건 우리 직원이다.
// 여기서 바로 저장할 수 있게 해줘야 "사진 올려주세요"가 실제로 이뤄진다.
//
// ⚠️ 폰에서 '저장'의 현실:
// 버튼으로 내려받으면 아이폰은 사진첩이 아니라 '파일'에 들어간다. 후기에 붙이려면
// 사진첩에 있는 게 편하고, 그건 사진을 꾹 눌러 저장하는 쪽이 확실하다.
// 그래서 버튼도 주되, 안내 문구로 '꾹 눌러 저장'을 먼저 알려준다.

interface Props {
  before: string | null
  after: string | null
  businessName: string
}

export function ReviewPhotos({ before, after, businessName }: Props) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const photos = [
    ...(before ? [{ url: before, caption: '작업 전' }] : []),
    ...(after ? [{ url: after, caption: '작업 후' }] : []),
  ]

  if (photos.length === 0) return null

  const saveAll = async () => {
    setSaving(true)
    try {
      for (const [i, p] of photos.entries()) {
        const res = await fetch(p.url)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${businessName}-${p.caption}.jpg`
        a.click()
        URL.revokeObjectURL(url)
        // 연달아 내려받으면 브라우저가 뒤엣것을 막는다 — 한 박자 쉬어준다
        if (i < photos.length - 1) await new Promise((r) => setTimeout(r, 400))
      }
      setSaved(true)
    } catch {
      // 저장이 막히면 새 탭으로 열어 직접 저장하게 한다
      photos.forEach((p) => window.open(p.url, '_blank'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* 라벨 — 사진 위에 어느 쪽인지 */}
      <div className="grid grid-cols-2 gap-2 text-left">
        {before && <p className="text-[11px] text-muted-foreground">작업 전</p>}
        {after && <p className="text-[11px] text-primary font-medium">작업 후</p>}
      </div>

      <PhotoGrid photos={photos} columns={2} />

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        사진을 <b className="font-semibold text-foreground">꾹 눌러 저장</b>한 뒤 후기에 함께 올려주시면 큰 도움이 돼요
      </p>

      <button
        type="button"
        onClick={saveAll}
        disabled={saving}
        className="w-full h-10 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
      >
        {saved ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            저장했어요
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            {saving ? '저장 중...' : `사진 ${photos.length}장 저장하기`}
          </>
        )}
      </button>
    </div>
  )
}
