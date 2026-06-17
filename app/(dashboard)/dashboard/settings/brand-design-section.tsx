'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  BRAND_PRESETS,
  DEFAULT_BRAND_COLOR,
  DEFAULT_BRAND_SECONDARY,
  normalizeHex,
  readableForeground,
  type HeroStyle,
} from '@/lib/brand'

interface Props {
  businessName: string
  brandColor: string
  brandSecondary: string
  heroStyle: HeroStyle
  logoUrl: string
  onChange: (next: {
    brandColor?: string
    brandSecondary?: string
    heroStyle?: HeroStyle
    logoUrl?: string
  }) => void
}

export function BrandDesignSection({
  businessName,
  brandColor,
  brandSecondary,
  heroStyle,
  logoUrl,
  onChange,
}: Props) {
  // 미리보기에 실제로 적용될 색 (미설정 시 기본값)
  const primary = normalizeHex(brandColor) ?? DEFAULT_BRAND_COLOR
  const secondary = normalizeHex(brandSecondary) ?? DEFAULT_BRAND_SECONDARY
  const isDark = heroStyle === 'dark'

  const activePreset = BRAND_PRESETS.find(
    (p) => p.primary === primary && p.secondary === secondary,
  )

  return (
    <div className="rounded-lg border bg-card p-5 space-y-5">
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          웹사이트 디자인
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          고객에게 보이는 내 업체 홍보 페이지의 색상과 분위기를 골라보세요. 아래에서 바로 미리 볼 수 있어요.
        </p>
      </div>

      {/* ── 실시간 미리보기 ── */}
      <div className="space-y-2">
        <Label className="text-xs">미리보기</Label>
        <div
          className="rounded-xl overflow-hidden border"
          style={{ background: isDark ? '#0f172a' : '#ffffff' }}
        >
          <div className="relative p-5 space-y-3">
            {/* 서브 색상 글로우 */}
            <div
              className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-40 pointer-events-none"
              style={{ background: secondary }}
            />
            <div className="relative space-y-3">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: `${primary}26`, color: isDark ? primary : primary }}
              >
                ✦ 5분 이내 무료 견적
              </span>
              <p
                className="text-lg font-extrabold leading-tight"
                style={{ color: isDark ? '#ffffff' : '#0f172a' }}
              >
                {businessName || '내 업체 이름'}
              </p>
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

      {/* ── 로고 ── */}
      <div className="space-y-1.5">
        <Label htmlFor="logo_url" className="text-xs">로고 이미지 주소 (선택)</Label>
        <Input
          id="logo_url"
          value={logoUrl}
          onChange={(e) => onChange({ logoUrl: e.target.value })}
          placeholder="https://...logo.png"
        />
        <p className="text-[11px] text-muted-foreground">
          비워두면 업체명이 글자로 표시돼요. 로고 이미지 주소를 넣으면 페이지 상단에 로고가 보여요.
        </p>
      </div>
    </div>
  )
}
