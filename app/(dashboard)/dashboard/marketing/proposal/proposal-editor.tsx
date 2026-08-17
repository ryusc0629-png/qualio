'use client'

import { useMemo, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PrintProposal } from '@/components/dashboard/print-proposal'
import { ProposalPhotoPicker } from './photo-picker'
import { buildProposalData, type ProposalBusiness, type ProposalExtras } from '@/lib/proposal/build'
import { saveProposalSettingsAction } from '@/lib/actions/proposal'
import {
  CATEGORY_CHOICES,
  THEME_CHOICES,
  PROPOSAL_DESIGNS,
  DEFAULT_SECTIONS,
  type ProposalCategory,
  type ProposalDesignId,
  type ProposalThemeId,
  type ProposalPhotos,
  type ProposalSettings,
  type ProposalStat,
  type ProposalSectionToggles,
} from '@/lib/proposal/content'
import { Eye } from 'lucide-react'

interface Props {
  business: ProposalBusiness
  settings: ProposalSettings | null
  extras: ProposalExtras
  qrDataUrl: string | null
}

type PhotoSlot = keyof ProposalPhotos

export function ProposalEditor({ business, settings, extras, qrDataUrl }: Props) {
  const [design, setDesign] = useState<ProposalDesignId>(settings?.design ?? 'classic')
  const [category, setCategory] = useState<ProposalCategory>(settings?.category ?? 'general')
  const [theme, setTheme] = useState<ProposalThemeId>(settings?.theme ?? 'brand')
  const [headline, setHeadline] = useState(settings?.headline ?? '')
  const [kicker, setKicker] = useState(settings?.kicker ?? '')
  const [stats, setStats] = useState<ProposalStat[]>(
    settings?.stats?.length ? settings.stats : [{ value: '', unit: '', label: '' }],
  )
  const [photos, setPhotos] = useState<ProposalPhotos>(settings?.photos ?? {})
  const [sections, setSections] = useState<ProposalSectionToggles>({
    ...DEFAULT_SECTIONS,
    ...(settings?.sections ?? {}),
  })

  const currentSettings: ProposalSettings = useMemo(
    () => ({ template: 'company', design, category, theme, headline, kicker, stats, photos, sections }),
    [design, category, theme, headline, kicker, stats, photos, sections],
  )
  const previewData = useMemo(
    () => buildProposalData(business, currentSettings, extras),
    [business, currentSettings, extras],
  )
  // 사진을 아직 안 고른 칸에 자동으로 들어갈 사진(미리보기용) — 인쇄와 같은 규칙으로 계산
  const autoData = useMemo(
    () => buildProposalData(business, { ...currentSettings, photos: {} }, extras),
    [business, currentSettings, extras],
  )

  const cleanStats = () => stats.filter((s) => s.value.trim() && s.label.trim())

  // 홈페이지에 값이 없어 지금은 소개서에 안 나오는 페이지 안내
  const missing = {
    owner: !previewData.owner,
    services: extras.services.length === 0,
    gallery: extras.beforeAfter.length === 0,
    reviews: extras.reviews.length === 0,
  }

  const SECTION_LABELS: { key: keyof ProposalSectionToggles; label: string; missing?: boolean; missingHint?: string }[] = [
    { key: 'owner', label: '대표 인사말 (홈페이지 값)', missing: missing.owner, missingHint: '설정 > 대표 인사말을 채우면 나와요' },
    { key: 'investment', label: '청소는 투자입니다 (설득)' },
    { key: 'services', label: '제공하는 서비스', missing: missing.services, missingHint: '서비스 항목을 등록하면 나와요' },
    { key: 'principles', label: '우리의 3원칙' },
    { key: 'gallery', label: '작업 전·후 사례 사진', missing: missing.gallery, missingHint: '설정 > 시공 사례에 사진을 올리면 나와요' },
    { key: 'refund', label: '100% 환불 약속' },
    { key: 'process', label: '진행 프로세스' },
    { key: 'reviews', label: '고객 후기 (실제 후기만)', missing: missing.reviews, missingHint: '공개 후기가 쌓이면 나와요' },
    { key: 'trust', label: '믿고 맡기는 이유 (실적)' },
  ]

  const { execute, isPending } = useAction(saveProposalSettingsAction, {
    onSuccess: () => toast.success('소개서가 저장됐어요!'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const payload = () => ({
    design,
    category,
    theme,
    headline: headline || undefined,
    kicker: kicker || undefined,
    stats: cleanStats(),
    photos,
    sections,
  })

  const save = () => execute(payload())

  // 저장 후 인쇄 페이지 새 탭 — 최신 설정이 반영되도록 살짝 지연
  const savePrintOpen = () => {
    execute(payload())
    setTimeout(() => window.open('/dashboard/marketing/proposal/print', '_blank'), 400)
  }

  const setStat = (i: number, patch: Partial<ProposalStat>) =>
    setStats((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const addStat = () => setStats((prev) => (prev.length >= 3 ? prev : [...prev, { value: '', unit: '', label: '' }]))
  const removeStat = (i: number) => setStats((prev) => prev.filter((_, idx) => idx !== i))

  const setPhoto = (slot: PhotoSlot, url: string) =>
    setPhotos((prev) => ({ ...prev, [slot]: url || undefined }))

  const toggleSection = (key: keyof ProposalSectionToggles) =>
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">소개서 만들기</h1>
        <p className="text-sm text-muted-foreground mt-1">
          홈페이지에 적어 둔 내용(대표 인사말·시공 사례·후기·서비스)이 그대로 소개서로 들어가요. 디자인만 고르고 PDF로 저장하세요.
        </p>
      </div>

      {!business.slug && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          아직 홈페이지 주소가 없어요. 표지·문의 QR이 비어 보일 수 있어요.{' '}
          <a href="/dashboard/settings" className="font-semibold underline">설정에서 홈페이지 먼저 만들기</a>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ── 편집 폼 ── */}
        <div className="space-y-5">
          {/* 디자인 템플릿 */}
          <section className="rounded-xl border p-4 space-y-3">
            <Label className="text-base font-semibold">디자인 고르기</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROPOSAL_DESIGNS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDesign(d.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    design === d.id ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'hover:border-primary/40'
                  }`}
                >
                  <DesignThumb id={d.id} />
                  <div className="text-sm font-semibold mt-2">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{d.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 사진 */}
          <section className="rounded-xl border p-4 space-y-3">
            <Label className="text-base font-semibold">소개서에 들어갈 사진</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              안 고르면 홈페이지에 올린 시공 사례 사진이 자동으로 들어가요.
            </p>
            <div className="space-y-2">
              <ProposalPhotoPicker
                label="표지 사진"
                hint="‘사진 강조’ 디자인에서 표지 전체에 깔려요"
                value={photos.cover ?? ''}
                autoUrl={autoData.coverPhoto}
                pool={extras.photoPool}
                onChange={(url) => setPhoto('cover', url)}
              />
              <ProposalPhotoPicker
                label="대표 사진"
                hint="대표 인사말 페이지에 들어가요"
                value={photos.owner ?? ''}
                autoUrl={autoData.owner?.photo ?? null}
                pool={extras.photoPool}
                onChange={(url) => setPhoto('owner', url)}
              />
              <ProposalPhotoPicker
                label="현장 사진 ①"
                hint="‘청소는 투자입니다’ 페이지"
                value={photos.investment ?? ''}
                autoUrl={autoData.investmentPhoto}
                pool={extras.photoPool}
                onChange={(url) => setPhoto('investment', url)}
              />
              <ProposalPhotoPicker
                label="현장 사진 ②"
                hint="‘이런 공간을 관리합니다’ 페이지"
                value={photos.category ?? ''}
                autoUrl={autoData.categoryPhoto}
                pool={extras.photoPool}
                onChange={(url) => setPhoto('category', url)}
              />
            </div>
          </section>

          {/* 대상 공간 */}
          <section className="rounded-xl border p-4 space-y-3">
            <Label className="text-base font-semibold">어떤 공간을 위한 소개서인가요?</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`h-12 rounded-lg border text-sm font-semibold transition-all ${
                    category === c.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">고르면 대상 공간 소개 문구가 그 공간에 맞게 바뀌어요.</p>
          </section>

          {/* 디자인 테마 */}
          <section className="rounded-xl border p-4 space-y-3">
            <Label className="text-base font-semibold">디자인 색상</Label>
            <div className="flex flex-wrap gap-2">
              {THEME_CHOICES.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setTheme(th.id)}
                  className={`h-11 px-4 rounded-lg border text-sm font-semibold transition-all ${
                    theme === th.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {th.name}
                </button>
              ))}
            </div>
          </section>

          {/* 표지 문구 */}
          <section className="rounded-xl border p-4 space-y-3">
            <Label className="text-base font-semibold">표지 문구</Label>
            <div className="space-y-1">
              <Label htmlFor="kicker" className="text-xs text-muted-foreground">한 줄 소개 (지역·전문 분야)</Label>
              <Input id="kicker" value={kicker} onChange={(e) => setKicker(e.target.value)} placeholder="예: 울산 상업공간 관리 전문" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="headline" className="text-xs text-muted-foreground">대표 슬로건</Label>
              <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="예: 당연한 일을, 철저하게 합니다" />
            </div>
          </section>

          {/* 신뢰 통계 */}
          <section className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">우리 실적 숫자 <span className="text-xs font-normal text-muted-foreground">(최대 3개)</span></Label>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">예: 3 / 년 / 정기청소를 운영해 온 시간. 비워두면 숫자 없이 나가요.</p>
            <div className="space-y-2">
              {stats.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={s.value} onChange={(e) => setStat(i, { value: e.target.value })} placeholder="3" className="w-16 text-center" inputMode="numeric" />
                  <Input value={s.unit} onChange={(e) => setStat(i, { unit: e.target.value })} placeholder="년" className="w-16 text-center" />
                  <Input value={s.label} onChange={(e) => setStat(i, { label: e.target.value })} placeholder="정기청소 운영 기간" className="flex-1" />
                  {stats.length > 1 && (
                    <button type="button" onClick={() => removeStat(i)} className="text-destructive text-sm px-2 shrink-0">빼기</button>
                  )}
                </div>
              ))}
              {stats.length < 3 && (
                <button type="button" onClick={addStat} className="w-full h-10 rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-primary/40">
                  + 숫자 추가
                </button>
              )}
            </div>
          </section>

          {/* 섹션 토글 */}
          <section className="rounded-xl border p-4 space-y-2">
            <Label className="text-base font-semibold">넣을 내용 고르기</Label>
            {SECTION_LABELS.map(({ key, label, missing: isMissing, missingHint }) => (
              <label key={key} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sections[key]}
                  onChange={() => toggleSection(key)}
                  className="accent-primary h-4 w-4 mt-0.5"
                />
                <span className="text-sm">
                  {label}
                  {isMissing && (
                    <span className="block text-[11px] text-amber-600">
                      {missingHint} ·{' '}
                      <a href="/dashboard/settings" className="underline font-semibold">설정 열기</a>
                    </span>
                  )}
                </span>
              </label>
            ))}
          </section>
        </div>

        {/* ── 미리보기 ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Eye className="h-4 w-4" /> 미리보기
          </div>
          <div className="rounded-xl border bg-muted/30 overflow-auto max-h-[70vh] lg:sticky lg:top-4">
            <div style={{ zoom: 0.42 }}>
              <PrintProposal data={previewData} qrDataUrl={qrDataUrl} variant="preview" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 액션 ── */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t py-3 flex flex-col sm:flex-row gap-2">
        <Button variant="outline" className="sm:flex-1 h-12" disabled={isPending} onClick={save}>
          {isPending ? '저장 중...' : '저장하기'}
        </Button>
        <Button className="sm:flex-1 h-12 font-semibold" disabled={isPending} onClick={savePrintOpen}>
          PDF로 저장 · 인쇄
        </Button>
      </div>
    </div>
  )
}

// 템플릿 미리보기 썸네일 — 실제 표지 레이아웃을 아주 단순화해 보여준다
function DesignThumb({ id }: { id: ProposalDesignId }) {
  const base = 'h-14 w-full rounded-md overflow-hidden border flex'
  if (id === 'photo') {
    return (
      <div className={`${base} bg-slate-700 relative`}>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 to-transparent" />
        <div className="relative m-2 space-y-1">
          <div className="h-1.5 w-10 bg-white/70 rounded" />
          <div className="h-2.5 w-14 bg-white rounded" />
        </div>
      </div>
    )
  }
  if (id === 'clean') {
    return (
      <div className={`${base} bg-white`}>
        <div className="w-1 bg-primary" />
        <div className="m-2 space-y-1">
          <div className="h-1.5 w-8 bg-slate-300 rounded" />
          <div className="h-2.5 w-12 bg-slate-700 rounded" />
        </div>
      </div>
    )
  }
  if (id === 'bold') {
    return (
      <div className={`${base} bg-white`}>
        <div className="flex-1 m-2 space-y-1">
          <div className="h-1.5 w-8 bg-primary rounded" />
          <div className="h-3 w-14 bg-slate-800 rounded" />
        </div>
        <div className="w-6 bg-primary/20" />
        <div className="w-8 bg-primary" />
      </div>
    )
  }
  return (
    <div className={`${base} bg-white`}>
      <div className="flex-1 m-2 space-y-1">
        <div className="h-1.5 w-8 bg-slate-300 rounded" />
        <div className="h-2.5 w-12 bg-slate-700 rounded" />
      </div>
      <div className="w-5 bg-primary/15" />
      <div className="w-5 bg-primary" />
    </div>
  )
}
