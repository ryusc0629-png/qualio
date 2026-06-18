'use client'

import { useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ExternalLink, Upload, X, Loader2 } from 'lucide-react'
import {
  BRAND_PRESETS,
  DEFAULT_BRAND_COLOR,
  DEFAULT_BRAND_SECONDARY,
  normalizeHex,
  readableForeground,
  type HeroStyle,
} from '@/lib/brand'
import { Input } from '@/components/ui/input'

interface Props {
  businessId: string
  businessName: string
  slug: string | null
  brandColor: string
  brandSecondary: string
  heroStyle: HeroStyle
  logoUrl: string
  heroTitle: string
  heroSubtitle: string
  onChange: (next: {
    brandColor?: string
    brandSecondary?: string
    heroStyle?: HeroStyle
    logoUrl?: string
    heroTitle?: string
    heroSubtitle?: string
  }) => void
}

export function BrandDesignSection({
  businessId,
  businessName,
  slug,
  brandColor,
  brandSecondary,
  heroStyle,
  logoUrl,
  heroTitle,
  heroSubtitle,
  onChange,
}: Props) {
  const primary = normalizeHex(brandColor) ?? DEFAULT_BRAND_COLOR
  const secondary = normalizeHex(brandSecondary) ?? DEFAULT_BRAND_SECONDARY
  const isDark = heroStyle === 'dark'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const activePreset = BRAND_PRESETS.find(
    (p) => p.primary === primary && p.secondary === secondary,
  )

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-logo', { method: 'POST', body: form })
      const json = await res.json() as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error ?? '업로드 실패')
      onChange({ logoUrl: json.url })
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드에 실패했어요. 다시 시도해주세요')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const previewUrl = slug ? `/biz/${slug}` : `/q/${businessId}`

  return (
    <div className="rounded-lg border bg-card p-5 space-y-5">
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          웹사이트 디자인
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          고객에게 보이는 내 업체 홍보 페이지의 색상과 분위기를 골라보세요.
        </p>
      </div>

      {/* ── 히어로 문구 직접 입력 ── */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs">페이지 제목</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">고객이 처음 보는 가장 큰 글자예요</p>
        </div>
        <Input
          value={heroTitle}
          onChange={(e) => onChange({ heroTitle: e.target.value })}
          placeholder={`예: ${businessName || '다트클린'} | 입주청소 전문`}
          maxLength={100}
        />
        <div>
          <Label className="text-xs">페이지 소개글</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">제목 아래 한두 줄 설명이에요</p>
        </div>
        <textarea
          value={heroSubtitle}
          onChange={(e) => onChange({ heroSubtitle: e.target.value })}
          placeholder="예: 10년 경력 전문 청소팀이 꼼꼼하게 작업해드려요. 당일 견적, 빠른 방문!"
          maxLength={300}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      {/* ── 실시간 미리보기 ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">미리보기</Label>
          <button
            type="button"
            onClick={() => window.open(previewUrl, '_blank')}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            전체 화면으로 보기
          </button>
        </div>
        <div
          className="rounded-xl overflow-hidden border"
          style={{ background: isDark ? '#0f172a' : '#ffffff' }}
        >
          <div className="relative p-5 space-y-3">
            <div
              className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-40 pointer-events-none"
              style={{ background: secondary }}
            />
            <div className="relative space-y-3">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: `${primary}26`, color: primary }}
              >
                ✦ 5분 이내 무료 견적
              </span>
              <p
                className="text-lg font-extrabold leading-tight"
                style={{ color: isDark ? '#ffffff' : '#0f172a' }}
              >
                {heroTitle || businessName || '내 업체 이름'}
              </p>
              {heroSubtitle && (
                <p className="text-xs leading-relaxed" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                  {heroSubtitle}
                </p>
              )}
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-bold"
                  style={{ background: primary, color: readableForeground(primary) }}
                >
                  무료 견적 받기
                </span>
                <span
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm border"
                  style={{
                    borderColor: isDark ? 'rgba(255,255,255,0.4)' : '#cbd5e1',
                    color: isDark ? '#ffffff' : '#334155',
                  }}
                >
                  전화 문의
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 색상 프리셋 ── */}
      <div className="space-y-2">
        <Label className="text-xs">색상 테마 (눌러서 선택)</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {BRAND_PRESETS.map((preset) => {
            const selected = activePreset?.name === preset.name
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() =>
                  onChange({ brandColor: preset.primary, brandSecondary: preset.secondary })
                }
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all ${
                  selected
                    ? 'border-primary ring-1 ring-primary/40 bg-primary/5'
                    : 'hover:bg-muted'
                }`}
              >
                <span className="flex gap-1">
                  <span className="h-5 w-5 rounded-full" style={{ background: preset.primary }} />
                  <span className="h-5 w-5 rounded-full" style={{ background: preset.secondary }} />
                </span>
                <span className="text-[11px] text-muted-foreground">{preset.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 직접 색상 지정 ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="brand_color_picker" className="text-xs">대표 색상 직접 고르기</Label>
          <div className="flex items-center gap-2">
            <input
              id="brand_color_picker"
              type="color"
              value={primary}
              onChange={(e) => onChange({ brandColor: e.target.value })}
              className="h-10 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-1"
              aria-label="대표 색상"
            />
            <Input
              value={brandColor}
              onChange={(e) => onChange({ brandColor: e.target.value })}
              placeholder="#2563eb"
              className="font-mono text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand_secondary_picker" className="text-xs">서브 색상 직접 고르기</Label>
          <div className="flex items-center gap-2">
            <input
              id="brand_secondary_picker"
              type="color"
              value={secondary}
              onChange={(e) => onChange({ brandSecondary: e.target.value })}
              className="h-10 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-1"
              aria-label="서브 색상"
            />
            <Input
              value={brandSecondary}
              onChange={(e) => onChange({ brandSecondary: e.target.value })}
              placeholder="#f59e0b"
              className="font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* ── 히어로 배경 분위기 ── */}
      <div className="space-y-2">
        <Label className="text-xs">상단 배경 분위기</Label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'dark' as const, label: '어둡게', desc: '고급스러운 느낌' },
            { value: 'light' as const, label: '밝게', desc: '깔끔한 느낌' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ heroStyle: opt.value })}
              className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                heroStyle === opt.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'hover:bg-muted'
              }`}
            >
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 로고 이미지 업로드 ── */}
      <div className="space-y-2">
        <Label className="text-xs">로고 이미지 (선택)</Label>

        {logoUrl ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="로고 미리보기"
              className="h-12 w-auto max-w-[120px] object-contain rounded"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{logoUrl.split('/').pop()}</p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ logoUrl: '' })}
              className="shrink-0 rounded-full p-1 hover:bg-muted text-muted-foreground"
              aria-label="로고 삭제"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 py-5 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                올리는 중...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                로고 이미지 올리기
              </>
            )}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogoUpload}
        />
        <p className="text-[11px] text-muted-foreground">
          비워두면 업체명이 글자로 표시돼요. 로고를 올리면 페이지 상단에 표시됩니다. (JPG, PNG 5MB 이하)
        </p>
      </div>

      <p className="text-xs text-center text-muted-foreground border-t pt-4">
        변경 후 아래로 스크롤하여 <span className="font-semibold text-foreground">설정 저장</span> 버튼을 눌러주세요
      </p>
    </div>
  )
}
