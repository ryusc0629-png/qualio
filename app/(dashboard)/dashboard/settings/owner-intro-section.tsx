'use client'

import { useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Camera, Upload, X, Loader2, UserRound, Video } from 'lucide-react'

interface Props {
  photoUrl: string
  name: string
  greeting: string
  videoUrl: string
  onChange: (next: { photoUrl?: string; name?: string; greeting?: string; videoUrl?: string }) => void
}

// 대표 인사말 섹션 — 얼굴 사진(자체 저장) + 이름/직함 + 인사말 + 인사말 영상(유튜브).
// 비테크 사장님 기준: 사진 올리기 + 짧게 몇 줄 쓰기 + (원하면) 유튜브 주소 붙여넣기.
export function OwnerIntroSection({ photoUrl, name, greeting, videoUrl, onChange }: Props) {
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error ?? '업로드 실패')
      onChange({ photoUrl: json.url })
    } catch (err) {
      alert(err instanceof Error ? err.message : '사진 올리기에 실패했어요. 다시 시도해주세요')
    } finally {
      setIsUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        사장님 얼굴과 짧은 인사말을 넣으면 <span className="font-medium text-foreground">‘진짜 사람이 하는 곳’</span>이라는
        믿음이 생겨서 문의로 훨씬 잘 이어져요. 얼굴 사진 한 장과 두세 줄이면 충분해요. (선택)
      </p>

      {/* 대표 사진 — 원형 미리보기 */}
      <div className="space-y-2">
        <Label className="text-xs">대표 사진</Label>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="대표 사진 미리보기"
                className="w-20 h-20 rounded-2xl object-cover border"
              />
              <button
                type="button"
                onClick={() => onChange({ photoUrl: '' })}
                className="absolute -top-1.5 -right-1.5 bg-black/70 rounded-full p-1 text-white hover:bg-black"
                aria-label="사진 삭제"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
              <UserRound className="h-8 w-8 text-muted-foreground/50" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 올리는 중...
                </>
              ) : (
                <>
                  {photoUrl ? <Upload className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  {photoUrl ? '사진 바꾸기' : '대표 사진 올리기'}
                </>
              )}
            </button>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              밝은 곳에서 정면으로 찍은 사진이 좋아요. 작업복 차림도 신뢰가 가요.
            </p>
          </div>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoUpload}
        />
      </div>

      {/* 대표 이름/직함 */}
      <div className="space-y-1.5">
        <Label htmlFor="owner_name" className="text-xs">대표 이름·직함 (선택)</Label>
        <Input
          id="owner_name"
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="예: 김철수 대표"
          maxLength={30}
        />
      </div>

      {/* 인사말 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="owner_greeting" className="text-xs">인사말</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">{greeting.length}/400자</span>
        </div>
        <textarea
          id="owner_greeting"
          value={greeting}
          onChange={(e) => onChange({ greeting: e.target.value })}
          placeholder="예: 안녕하세요, 10년째 이 동네에서 청소하고 있는 김철수입니다. 남의 집을 내 집처럼 여기고, 눈에 안 보이는 곳까지 정성껏 하겠습니다. 믿고 맡겨주세요."
          maxLength={400}
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none leading-relaxed"
        />
        <p className="text-[11px] text-muted-foreground">
          말하듯 편하게 두세 줄이면 돼요. 왜 이 일을 하는지, 어떤 마음으로 하는지 적으면 좋아요.
        </p>
      </div>

      {/* 인사말 영상 (유튜브) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5 text-red-500" />
          <Label htmlFor="owner_video_url" className="text-xs">인사말 영상 (선택 · 유튜브)</Label>
        </div>
        <Input
          id="owner_video_url"
          value={videoUrl}
          onChange={(e) => onChange({ videoUrl: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          휴대폰으로 인사말을 짧게 찍어 유튜브에 올린 뒤 주소를 붙여넣으면, 홈페이지에서 바로 재생돼요.
          유튜브에서 <span className="font-medium text-foreground">‘공개’ 또는 ‘일부공개’</span>로 올려야 재생돼요(‘비공개’는 안 돼요).
          가로로 찍으면 화면에 꽉 차게 보여요. 지금 없으면 나중에 추가해도 돼요.
        </p>
      </div>
    </div>
  )
}
