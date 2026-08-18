'use client'

import { useRef, useState } from 'react'
import { Camera, X, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'

// 사진 몇 장 올리는 작은 칸. 클레임 접수·처리 사진처럼 '한두 장만 붙이는' 자리에 쓴다.
//
// 보고서 화면(field-report-client 등)은 자체 업로드 로직을 이미 갖고 있어 건드리지 않았다.
// 새로 사진을 받는 자리가 생기면 이 조각을 쓸 것 — 화면마다 업로드를 새로 짜면
// 실패 처리·장수 제한이 제각각이 된다.

async function uploadOne(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
  const json = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !json.url) throw new Error(json.error ?? '업로드에 실패했어요')
  return json.url
}

interface Props {
  label: string
  hint?: string
  urls: string[]
  onChange: (urls: string[]) => void
  max?: number
}

export function PhotoPicker({ label, hint, urls, onChange, max = 4 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)

  const pick = async (files: FileList) => {
    const remaining = max - urls.length
    if (remaining <= 0) {
      toast.error(`사진은 최대 ${max}장까지 올릴 수 있어요`)
      return
    }
    const list = Array.from(files).slice(0, remaining)
    setUploading(list.length)
    const done: string[] = []
    for (const f of list) {
      try {
        done.push(await uploadOne(f))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '사진을 올리지 못했어요')
      }
    }
    setUploading(0)
    if (done.length > 0) onChange([...urls, ...done])
  }

  return (
    <div className="space-y-1.5">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {urls.map((url) => (
          <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(urls.filter((u) => u !== url))}
              className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
              aria-label="사진 삭제"
            >
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        ))}

        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center animate-pulse">
            <Upload className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}

        {urls.length + uploading < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-0.5 hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <Camera className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">추가</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            void pick(e.target.files)
            e.target.value = ''
          }
        }}
      />
    </div>
  )
}
