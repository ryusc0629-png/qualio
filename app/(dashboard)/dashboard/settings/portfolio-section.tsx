'use client'

import { useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Camera, Upload, X, Loader2, Plus, Images, Trash2 } from 'lucide-react'

export interface PortfolioItem {
  before: string
  after: string
}

interface Props {
  value: PortfolioItem[]
  onChange: (next: PortfolioItem[]) => void
}

// 한 장 업로드 슬롯 — 비포/애프터 각각
function PhotoSlot({
  url,
  label,
  onUploaded,
  onClear,
}: {
  url: string
  label: string
  onUploaded: (url: string) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error ?? '업로드 실패')
      onUploaded(json.url)
    } catch (err) {
      alert(err instanceof Error ? err.message : '사진 올리기에 실패했어요. 다시 시도해주세요')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {url ? (
        <div className="relative rounded-xl overflow-hidden border aspect-square bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 rounded-full p-1 text-white transition-colors"
            aria-label={`${label} 삭제`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="w-full aspect-square flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
        >
          {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          <span>{isUploading ? '올리는 중...' : `${label} 올리기`}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  )
}

// 시공 사례 섹션 — 사장님이 비포·애프터 사진을 직접 등록(작업 보고와 별개).
// 홍보 페이지 '시공 사례' 갤러리에 자동 반영. 청소업 전환율 최강 콘텐츠.
export function PortfolioSection({ value, onChange }: Props) {
  const updateItem = (idx: number, patch: Partial<PortfolioItem>) => {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }
  const removeItem = (idx: number) => onChange(value.filter((_, i) => i !== idx))
  const addItem = () => {
    if (value.length >= 6) return
    onChange([...value, { before: '', after: '' }])
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        작업 전·후 사진을 직접 올리면 홍보 페이지 <span className="font-medium text-foreground">‘시공 사례’</span>에 나란히 보여요.
        청소는 <span className="font-medium text-foreground">사진 한 장이 가장 강력한 설득</span>이에요. 최대 6개까지 등록할 수 있어요. (선택)
      </p>

      {value.length === 0 ? (
        <div className="text-center py-8 space-y-3 rounded-xl border-2 border-dashed border-muted-foreground/20">
          <Images className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">아직 등록된 시공 사례가 없어요</p>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors"
          >
            <Plus className="h-4 w-4" />
            첫 번째 시공 사례 올리기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((item, idx) => (
            <div key={idx} className="rounded-xl border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">시공 사례 {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`시공 사례 ${idx + 1} 삭제`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PhotoSlot
                  url={item.before}
                  label="작업 전"
                  onUploaded={(url) => updateItem(idx, { before: url })}
                  onClear={() => updateItem(idx, { before: '' })}
                />
                <PhotoSlot
                  url={item.after}
                  label="작업 후"
                  onUploaded={(url) => updateItem(idx, { after: url })}
                  onClear={() => updateItem(idx, { after: '' })}
                />
              </div>
              {(!item.before || !item.after) && (
                <p className="text-[11px] text-amber-600">
                  작업 전·후 두 장을 모두 올려야 홍보 페이지에 표시돼요.
                </p>
              )}
            </div>
          ))}

          {value.length < 6 && (
            <button
              type="button"
              onClick={addItem}
              className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              시공 사례 추가
            </button>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
        <Upload className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          작업 보고에서 <span className="font-medium">‘홈 공개’</span>를 켠 사진도 시공 사례에 함께 나와요. 여기선 보고와 상관없이 직접 올릴 수 있어요.
        </p>
      </div>
    </div>
  )
}
