'use client'

import { useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ExternalLink, Upload, X, Loader2, AlertTriangle, CheckCircle2, Camera } from 'lucide-react'
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
  heroImageUrl: string
  heroTitle: string
  heroSubtitle: string
  onChange: (next: {
    brandColor?: string
    brandSecondary?: string
    heroStyle?: HeroStyle
    logoUrl?: string
    heroImageUrl?: string
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
  heroImageUrl,
  heroTitle,
  heroSubtitle,
  onChange,
}: Props) {
  const primary = normalizeHex(brandColor) ?? DEFAULT_BRAND_COLOR
  const secondary = normalizeHex(brandSecondary) ?? DEFAULT_BRAND_SECONDARY
  const isDark = heroStyle === 'dark'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const heroImageInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadingHero, setIsUploadingHero] = useState(false)
  const [showHeroGuide, setShowHeroGuide] = useState(false)

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

  async function handleHeroImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingHero(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-hero-image', { method: 'POST', body: form })
      const json = await res.json() as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error ?? '업로드 실패')
      onChange({ heroImageUrl: json.url })
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드에 실패했어요. 다시 시도해주세요')
    } finally {
      setIsUploadingHero(false)
      if (heroImageInputRef.current) heroImageInputRef.current.value = ''
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
          <div className="flex items-center justify-between">
            <Label className="text-xs">페이지 제목</Label>
            {/* 글자 수 카운터 */}
            <span className={`text-[11px] tabular-nums ${
              heroTitle.length === 0
                ? 'text-muted-foreground'
                : heroTitle.length <= 15
                  ? 'text-emerald-600 font-medium'
                  : heroTitle.length <= 22
                    ? 'text-amber-500 font-medium'
                    : 'text-red-500 font-medium'
            }`}>
              {heroTitle.length}/30자
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">고객이 처음 보는 가장 큰 글자예요</p>
        </div>

        {/* 글자 수 가이드 */}
        <div className="flex gap-2 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-600">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            15자 이내 — 한 줄로 표시
          </span>
          <span className="flex items-center gap-1 text-amber-500">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            16~22자 — 두 줄로 표시
          </span>
          <span className="flex items-center gap-1 text-red-500">
            <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
            23자 이상 — 비추천
          </span>
        </div>

        <Input
          value={heroTitle}
          onChange={(e) => onChange({ heroTitle: e.target.value })}
          placeholder={`예: ${businessName || '다트클린'} | 입주청소 전문`}
          maxLength={30}
        />

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">페이지 소개글</Label>
            <span className={`text-[11px] tabular-nums ${
              heroSubtitle.length === 0
                ? 'text-muted-foreground'
                : heroSubtitle.length <= 50
                  ? 'text-emerald-600 font-medium'
                  : heroSubtitle.length <= 80
                    ? 'text-amber-500 font-medium'
                    : 'text-red-500 font-medium'
            }`}>
              {heroSubtitle.length}/100자
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">제목 아래 한두 줄 설명이에요 — 50자 이내를 추천해요</p>
        </div>
        <textarea
          value={heroSubtitle}
          onChange={(e) => onChange({ heroSubtitle: e.target.value })}
          placeholder="예: 10년 경력 전문 청소팀이 꼼꼼하게 작업해드려요. 당일 견적, 빠른 방문!"
          maxLength={100}
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

      {/* ── 히어로 배경 이미지 업로드 ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">대표 사진 (선택)</Label>
          <button
            type="button"
            onClick={() => setShowHeroGuide((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Camera className="h-3 w-3" />
            어떤 사진이 좋은가요?
          </button>
        </div>

        {/* 품질 가이드 — 토글 */}
        {showHeroGuide && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5 text-xs">
            <div className="flex items-start gap-2 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p className="font-semibold leading-snug">
                퀄리티 낮은 사진은 오히려 고객 신뢰를 낮출 수 있어요. 아래 기준을 꼭 확인해주세요.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="font-semibold text-emerald-700">✅ 이런 사진이 좋아요</p>
                <ul className="space-y-0.5 text-muted-foreground pl-1">
                  <li>• 밝고 깔끔하게 정돈된 시공 후 모습</li>
                  <li>• 자연광 또는 밝은 실내조명</li>
                  <li>• 넓은 공간 전체가 보이는 구도</li>
                  <li>• 전문 장비나 작업 모습</li>
                </ul>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-red-600">❌ 이런 사진은 피해주세요</p>
                <ul className="space-y-0.5 text-muted-foreground pl-1">
                  <li>• 어둡거나 흐릿한 사진</li>
                  <li>• 픽셀이 깨지거나 흔들린 사진</li>
                  <li>• 청소 전 (지저분한) 상태 사진</li>
                  <li>• 스마트폰으로 찍은 저화질 사진</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {heroImageUrl ? (
          <div className="relative rounded-xl overflow-hidden border aspect-video bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImageUrl}
              alt="대표 사진 미리보기"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => heroImageInputRef.current?.click()}
                disabled={isUploadingHero}
                className="flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-[11px] px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Upload className="h-3 w-3" />
                교체
              </button>
              <button
                type="button"
                onClick={() => onChange({ heroImageUrl: '' })}
                className="bg-black/60 hover:bg-black/80 rounded-lg p-1.5 text-white transition-colors"
                aria-label="사진 삭제"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 text-white text-[11px] px-2 py-1 rounded-md">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              등록된 대표 사진
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => heroImageInputRef.current?.click()}
            disabled={isUploadingHero}
            className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 py-8 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
          >
            {isUploadingHero ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>올리는 중...</span>
              </>
            ) : (
              <>
                <Camera className="h-6 w-6" />
                <span>대표 사진 올리기</span>
                <span className="text-[11px] text-muted-foreground/70">밝고 깔끔한 시공 후 사진 권장</span>
              </>
            )}
          </button>
        )}

        <input
          ref={heroImageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleHeroImageUpload}
        />
        <p className="text-[11px] text-muted-foreground">
          홍보 페이지 상단에 표시되는 대표 사진이에요. 비워두면 색상 배경만 보여요. (JPG, PNG 5MB 이하)
        </p>
      </div>

      <p className="text-xs text-center text-muted-foreground border-t pt-4">
        변경 후 아래로 스크롤하여 <span className="font-semibold text-foreground">설정 저장</span> 버튼을 눌러주세요
      </p>
    </div>
  )
}
