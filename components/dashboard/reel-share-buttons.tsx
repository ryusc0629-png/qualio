'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Download, Share2 } from 'lucide-react'

// 완성된 홍보 영상을 손에 쥐여주는 버튼.
//
// ⚠️ 인스타그램은 밖에서 영상을 얹어 글쓰기 화면을 열어주는 방법이 없다(공식 API는
//    업체 계정을 하나하나 연결해야 쓸 수 있다). 그래서 지금 할 수 있는 건 두 가지다:
//    폰이면 '공유하기'로 인스타 앱에 바로 넘기고, PC면 내려받아서 올리는 것.
//    ⛔"인스타그램에 바로 올리기" 같은 버튼을 만들어두고 실제로는 링크만 여는 짓은 하지 말 것.

export function ReelShareButtons({ url, label }: { url: string; label: string }) {
  const fileName = `${label.replace(/[^\p{L}\p{N}]+/gu, '-')}.mp4`

  // 폰에서는 공유 시트를 띄워 인스타·틱톡 앱으로 바로 넘긴다
  const share = async () => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: label })
        return
      }
      // 파일 공유가 안 되는 브라우저 — 주소만이라도 넘긴다
      if (navigator.share) {
        await navigator.share({ title: label, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success('영상 주소를 복사했어요')
    } catch (err) {
      // 사용자가 공유 시트를 닫은 것뿐이면 오류로 알리지 않는다
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('[Reel] 공유 실패:', err)
      toast.error('공유하지 못했어요. 아래 내려받기를 눌러주세요')
    }
  }

  const download = async () => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileName
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('[Reel] 내려받기 실패:', err)
      // 막히면 새 탭에서 열어 길게 눌러 저장하게 한다
      window.open(url, '_blank', 'noopener')
    }
  }

  return (
    <div className="flex gap-2">
      <Button type="button" className="flex-1 h-11 gap-1.5" onClick={share}>
        <Share2 className="h-4 w-4" />
        인스타에 올리기
      </Button>
      <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={download}>
        <Download className="h-4 w-4" />
        내려받기
      </Button>
    </div>
  )
}
