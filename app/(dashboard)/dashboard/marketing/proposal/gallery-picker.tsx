'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, RotateCcw, Users } from 'lucide-react'

interface Props {
  // 사장님이 고른 사진(비어 있으면 홈페이지 사진이 자동으로 들어감)
  value: string[]
  // 자동으로 들어갈 사진 — 미리보기용
  autoUrls: string[]
  pool: string[]
  onChange: (next: string[]) => void
}

const MAX = 6

// 작업 포트폴리오 사진 고르기 — 여러 장을 눌러서 담고, 없는 사진은 바로 올린다.
export function GalleryPicker({ value, autoUrls, pool, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const picked = value.length > 0
  const shown = picked ? value : autoUrls.slice(0, MAX)

  const toggle = (url: string) => {
    if (value.includes(url)) {
      onChange(value.filter((u) => u !== url))
      return
    }
    if (value.length >= MAX) return
    onChange([...value, url])
  }

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
      onChange([...(picked ? value : shown), json.url].slice(0, MAX))
    } catch (err) {
      alert(err instanceof Error ? err.message : '사진 올리기에 실패했어요. 다시 시도해주세요')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="rounded-xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold">작업 포트폴리오 사진</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            소개서 한 페이지에 사진 {MAX}장까지 들어가요. 안 고르면 홈페이지에 올린 사진이 자동으로 들어가요.
          </p>
        </div>
        {picked && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> 자동으로
          </button>
        )}
      </div>

      {/* 사람이 나온 사진을 권하는 안내 — 소개서에서 가장 눈길이 오래 머무는 사진이라서 */}
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
        <Users className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          <span className="font-semibold text-foreground">일하는 사람이 보이는 사진</span>을 한 장이라도 넣어보세요.
          사람 얼굴이 있으면 보는 사람 시선이 한 번 더 머뭅니다. 청소 전·후 사진은 어느 업체나 비슷해서
          기억에 남지 않지만, 유니폼 입고 작업하는 모습·장비를 다루는 손은 그 업체만의 사진이에요.
        </p>
      </div>

      {/* 지금 들어갈 사진 */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1.5">
          지금 들어가는 사진 {shown.length}장 {picked ? '(직접 고름)' : '(자동)'}
        </div>
        {shown.length === 0 ? (
          <div className="text-center py-6 space-y-2 rounded-lg border-2 border-dashed border-muted-foreground/20">
            <p className="text-sm text-muted-foreground">아직 넣을 사진이 없어요</p>
            <p className="text-[11px] text-muted-foreground">아래에서 고르거나 새로 올려주세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-1.5">
            {shown.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${url}-${i}`} src={url} alt="" className="aspect-square w-full object-cover rounded-md border" />
            ))}
          </div>
        )}
      </div>

      {/* 고르기 */}
      {pool.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">내 사진에서 고르기 (최대 {MAX}장)</div>
          <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto overscroll-contain">
            {pool.map((url) => {
              const on = value.includes(url)
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => toggle(url)}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                    on ? 'border-primary' : 'border-transparent hover:border-primary/40'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {on && (
                    <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {value.indexOf(url) + 1}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="w-full h-11 rounded-lg border text-sm font-semibold hover:border-primary/40 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {isUploading ? '올리는 중...' : '새 사진 올리기'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </section>
  )
}
