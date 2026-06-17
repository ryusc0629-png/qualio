import type { CSSProperties } from 'react'

// ============================================================
// 고객사 웹사이트 브랜드 커스터마이징 헬퍼
// 색상은 순수 CSS 변수 주입 — AI 토큰과 무관, 런타임 비용 0
// ============================================================

export type HeroStyle = 'dark' | 'light'

export interface BrandSettings {
  brandColor: string | null
  brandColorSecondary: string | null
  heroStyle: HeroStyle
}

// 비테크 사장님용 프리셋 팔레트 — 컬러피커보다 선택이 쉬움
export const BRAND_PRESETS = [
  { name: '청록(기본)', primary: '#0d9488', secondary: '#f59e0b' },
  { name: '바다 파랑', primary: '#2563eb', secondary: '#f97316' },
  { name: '숲 초록', primary: '#16a34a', secondary: '#eab308' },
  { name: '선명 보라', primary: '#7c3aed', secondary: '#ec4899' },
  { name: '따뜻 주황', primary: '#ea580c', secondary: '#0ea5e9' },
  { name: '시크 먹색', primary: '#1e293b', secondary: '#14b8a6' },
  { name: '로즈 핑크', primary: '#e11d48', secondary: '#6366f1' },
  { name: '하늘 청록', primary: '#0891b2', secondary: '#f43f5e' },
] as const

// 기본값 — globals.css 의 --primary(청록)와 동일 계열
export const DEFAULT_BRAND_COLOR = '#0d9488'
export const DEFAULT_BRAND_SECONDARY = '#f59e0b'

const HEX_RE = /^#([0-9a-fA-F]{6})$/

/** #RRGGBB 형식만 통과 — 아니면 null */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return HEX_RE.test(trimmed) ? trimmed.toLowerCase() : null
}

/** 배경색 대비 가독성 있는 전경색(흰/검) 반환 — WCAG 상대휘도 기준 */
export function readableForeground(hex: string): string {
  const normalized = normalizeHex(hex)
  if (!normalized) return '#ffffff'
  const r = parseInt(normalized.slice(1, 3), 16) / 255
  const g = parseInt(normalized.slice(3, 5), 16) / 255
  const b = parseInt(normalized.slice(5, 7), 16) / 255
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  // 밝은 배경이면 어두운 글씨, 어두운 배경이면 흰 글씨
  return luminance > 0.5 ? '#0f172a' : '#ffffff'
}

/**
 * biz 페이지 루트에 주입할 CSS 변수 묶음.
 * 페이지 전체가 text-primary / bg-primary 토큰을 쓰므로
 * --primary 만 덮어쓰면 강조색이 일괄 적용된다.
 */
export function buildBrandStyle(settings: BrandSettings): CSSProperties {
  const primary = normalizeHex(settings.brandColor)
  const secondary = normalizeHex(settings.brandColorSecondary)

  const style: Record<string, string> = {}
  if (primary) {
    style['--primary'] = primary
    style['--ring'] = primary
    style['--primary-foreground'] = readableForeground(primary)
  }
  // 서브 색상 — 기본은 대표색 계열, 지정 시 별도 글로우 등에 사용
  style['--brand-secondary'] = secondary ?? primary ?? DEFAULT_BRAND_SECONDARY

  return style as CSSProperties
}

/** DB row → BrandSettings (안전 변환) */
export function toBrandSettings(row: {
  brand_color?: string | null
  brand_color_secondary?: string | null
  hero_style?: string | null
}): BrandSettings {
  return {
    brandColor: normalizeHex(row.brand_color),
    brandColorSecondary: normalizeHex(row.brand_color_secondary),
    heroStyle: row.hero_style === 'light' ? 'light' : 'dark',
  }
}
