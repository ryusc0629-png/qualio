'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, Images, RotateCcw } from 'lucide-react'

interface Props {
  label: string
  hint: string
  // 사장님이 고른 사진(비어 있으면 홈페이지 사진을 자동으로 씀)
  value: string
  // 자동으로 들어갈 사진 — 미리보기용
  autoUrl: string | null
  // 홈페이지에 이미 올라가 있는 사진들(시공 사례·작업 보고·대표 사진)
  pool: string[]
  onChange: (url: string) => void
}

// 소개서 사진 한 칸 — ① 홈페이지 사진에서 고르기 ② 새로 올리기 ③ 자동으로 되돌리기
export function ProposalPhotoPicker({ label, hint, value, autoUrl, pool, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isPicking, setIsPicking] = useState(false)

  const shown = value || autoUrl

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error ?? '사진 올리기에 실패했어요')
      onChange(json.url)
      setIsPicking(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '사진 올리기에 실패했어요. 다시 시도해주세요')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-xl border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> 자동으로
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-20 w-28 shrink-0 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={label} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] text-muted-foreground">사진 없음</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <button
            type="button"
            onClick={() => setIsPicking((v) => !v)}
            className="h-10 rounded-lg border text-sm font-semibold hover:border-primary/40 inline-flex items-center justify-center gap-1.5"
          >
            <Images className="h-4 w-4" /> {isPicking ? '접기' : '내 사진에서 고르기'}
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="h-10 rounded-lg border text-sm font-semibold hover:border-primary/40 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {isUploading ? '올리는 중...' : '새 사진 올리기'}
          </button>
        </div>
      </div>

      {isPicking && (
        <div className="rounded-lg bg-muted/40 p-2">
          {pool.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              아직 올린 사진이 없어요. ‘새 사진 올리기’로 바로 넣을 수 있어요.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto overscroll-contain">
              {pool.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    onChange(url)
                    setIsPicking(false)
                  }}
                  className={`aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                    value === url ? 'border-primary' : 'border-transparent hover:border-primary/40'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  )
}
