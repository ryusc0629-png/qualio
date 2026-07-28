'use client'

import { Input } from '@/components/ui/input'
import { Plus, Trash2, Check, Sparkles } from 'lucide-react'
import {
  STRENGTH_PRESETS,
  getStrengthIcon,
  MAX_STRENGTHS,
  type Strength,
} from '@/lib/business/strengths'

interface Props {
  value: Strength[]
  onChange: (next: Strength[]) => void
}

// 우리 업체 강점 편집 — 팔레트에서 탭으로 켜고(기본 문구 자동), 아래에서 문구만 다듬는 구조.
// 비테크 사장님 기준: 글을 쓰는 게 아니라 "해당되는 것 누르기"가 기본 동작.
export function StrengthsSection({ value, onChange }: Props) {
  const usedKeys = new Set(value.map((s) => s.key))
  const atMax = value.length >= MAX_STRENGTHS

  const addPreset = (preset: Strength) => {
    if (atMax) return
    onChange([...value, { key: preset.key, title: preset.title, desc: preset.desc }])
  }
  const addCustom = () => {
    if (atMax) return
    onChange([...value, { key: 'custom', title: '', desc: '' }])
  }
  const update = (idx: number, patch: Partial<Strength>) =>
    onChange(value.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))

  // 아직 안 켠 프리셋만 팔레트에 노출(켜면 아래 목록으로 이동)
  const available = STRENGTH_PRESETS.filter((p) => !usedKeys.has(p.key))

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            우리 업체 강점
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          고객이 다른 곳 말고 <span className="font-medium text-foreground">우리를 선택하는 이유</span>예요.
          해당하는 것을 눌러서 켜면 홍보 페이지에 <span className="font-medium text-foreground">‘우리만의 차이’</span> 칸으로
          자동으로 올라가요. 눌러 켠 다음 문구는 우리 업체에 맞게 고칠 수 있어요. (최대 {MAX_STRENGTHS}개)
        </p>
      </div>

      {/* 팔레트 — 해당되는 것 눌러서 켜기 */}
      {available.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            해당하는 것을 눌러 켜세요
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((preset) => {
              const Icon = getStrengthIcon(preset.key)
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => addPreset(preset)}
                  disabled={atMax}
                  className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {preset.title}
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 켠 강점 목록 — 문구 다듬기 */}
      {value.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-foreground">
            켜진 강점 <span className="text-muted-foreground">({value.length}/{MAX_STRENGTHS})</span>
          </p>
          {value.map((s, idx) => {
            const Icon = getStrengthIcon(s.key)
            return (
              <div key={idx} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium">강점 {idx + 1}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="이 강점 빼기"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  value={s.title}
                  onChange={(e) => update(idx, { title: e.target.value })}
                  placeholder="예: 경력 15년 이상"
                  maxLength={20}
                  className="h-9 text-sm font-medium"
                />
                <Input
                  value={s.desc}
                  onChange={(e) => update(idx, { desc: e.target.value })}
                  placeholder="예: 오랜 경력의 전문 청소팀이 직접 작업해요"
                  maxLength={60}
                  className="h-9 text-sm"
                />
              </div>
            )
          })}
        </div>
      )}

      {/* 직접 추가 */}
      {!atMax && (
        <button
          type="button"
          onClick={addCustom}
          className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          목록에 없는 강점 직접 추가하기
        </button>
      )}

      {value.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/80 leading-relaxed">
            아직 강점을 안 켜셨어요. 위에서 해당하는 것만 눌러도 홍보 페이지가 훨씬 믿음직해져요.
            안 켜면 기본 소개 문구가 들어가요.
          </p>
        </div>
      )}
    </div>
  )
}
