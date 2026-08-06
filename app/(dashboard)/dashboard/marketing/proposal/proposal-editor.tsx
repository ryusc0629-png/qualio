'use client'

import { useMemo, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PrintProposal } from '@/components/dashboard/print-proposal'
import { buildProposalData, type ProposalBusiness } from '@/lib/proposal/build'
import { saveProposalSettingsAction } from '@/lib/actions/proposal'
import {
  CATEGORY_CHOICES,
  THEME_CHOICES,
  DEFAULT_SECTIONS,
  type ProposalCategory,
  type ProposalThemeId,
  type ProposalSettings,
  type ProposalStat,
  type ProposalSectionToggles,
} from '@/lib/proposal/content'
import { Eye } from 'lucide-react'

interface Props {
  business: ProposalBusiness
  settings: ProposalSettings | null
  qrDataUrl: string | null
}

const SECTION_LABELS: { key: keyof ProposalSectionToggles; label: string }[] = [
  { key: 'investment', label: '청소는 투자입니다 (설득)' },
  { key: 'principles', label: '우리의 3원칙' },
  { key: 'refund', label: '100% 환불 약속' },
  { key: 'process', label: '진행 프로세스' },
  { key: 'trust', label: '믿고 맡기는 이유 (실적)' },
]

export function ProposalEditor({ business, settings, qrDataUrl }: Props) {
  const [category, setCategory] = useState<ProposalCategory>(settings?.category ?? 'general')
  const [theme, setTheme] = useState<ProposalThemeId>(settings?.theme ?? 'brand')
  const [headline, setHeadline] = useState(settings?.headline ?? '')
  const [kicker, setKicker] = useState(settings?.kicker ?? '')
  const [stats, setStats] = useState<ProposalStat[]>(
    settings?.stats?.length ? settings.stats : [{ value: '', unit: '', label: '' }],
  )
  const [sections, setSections] = useState<ProposalSectionToggles>(settings?.sections ?? DEFAULT_SECTIONS)

  const currentSettings: ProposalSettings = useMemo(
    () => ({ template: 'company', category, theme, headline, kicker, stats, sections }),
    [category, theme, headline, kicker, stats, sections],
  )
  const previewData = useMemo(() => buildProposalData(business, currentSettings), [business, currentSettings])

  const cleanStats = () => stats.filter((s) => s.value.trim() && s.label.trim())

  const { execute, isPending } = useAction(saveProposalSettingsAction, {
    onSuccess: () => toast.success('소개서가 저장됐어요!'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const save = () =>
    execute({ category, theme, headline: headline || undefined, kicker: kicker || undefined, stats: cleanStats(), sections })

  // 저장 후 인쇄 페이지 새 탭 — 최신 설정이 반영되도록 살짝 지연
  const savePrintOpen = () => {
    execute({ category, theme, headline: headline || undefined, kicker: kicker || undefined, stats: cleanStats(), sections })
    setTimeout(() => window.open('/dashboard/marketing/proposal/print', '_blank'), 400)
  }

  const setStat = (i: number, patch: Partial<ProposalStat>) =>
    setStats((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const addStat = () => setStats((prev) => (prev.length >= 3 ? prev : [...prev, { value: '', unit: '', label: '' }]))
  const removeStat = (i: number) => setStats((prev) => prev.filter((_, idx) => idx !== i))

  const toggleSection = (key: keyof ProposalSectionToggles) =>
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">소개서 만들기</h1>
        <p className="text-sm text-muted-foreground mt-1">
          업체 정보로 자동으로 채워드려요. 몇 가지만 골라 다듬고 PDF로 저장해 손님에게 보내세요.
        </p>
      </div>

      {!business.slug && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          아직 홍보 페이지 주소가 없어요. 표지·문의 QR이 비어 보일 수 있어요.{' '}
          <a href="/dashboard/settings" className="font-semibold underline">설정에서 홍보 페이지 먼저 만들기</a>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ── 편집 폼 ── */}
        <div className="space-y-5">
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
            {SECTION_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                <input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} className="accent-primary h-4 w-4" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </section>
        </div>

        {/* ── 미리보기 ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Eye className="h-4 w-4" /> 미리보기
          </div>
          <div className="rounded-xl border bg-muted/30 overflow-auto max-h-[70vh]">
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
