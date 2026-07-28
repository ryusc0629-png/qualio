'use client'

import { CheckCircle2, ChevronRight, Sparkles } from 'lucide-react'

export interface CompletenessItem {
  key: string
  label: string
  hint?: string
  done: boolean
  essential: boolean // 필수(홈페이지 공개) vs 강화(설득력)
}

interface Props {
  items: CompletenessItem[]
  onJump: (key: string) => void
}

// 숨고식 완성도 온보딩 패널 — 채울수록 홈페이지 설득력이 강해진다는 걸 % 진행바로 보여준다.
// 필수(공개 준비)와 강화(설득력)를 나눠, 안 채운 칸으로 바로 데려간다.
export function CompletenessPanel({ items, onJump }: Props) {
  const total = items.length
  const doneCount = items.filter((i) => i.done).length
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const essentials = items.filter((i) => i.essential)
  const enrichment = items.filter((i) => !i.essential)

  // 완성도 구간별 응원 문구
  const message =
    percent >= 100
      ? '완벽해요! 홍보 페이지가 꽉 찼어요 👏'
      : percent >= 70
        ? '거의 다 됐어요. 조금만 더 채우면 완성이에요'
        : percent >= 40
          ? '좋아요! 채울수록 고객 설득이 강해져요'
          : '항목을 채우면 홈페이지가 점점 좋아져요'

  const renderRow = (item: CompletenessItem) => (
    <li key={item.key}>
      {item.done ? (
        <div className="flex items-center gap-2 py-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-foreground/80">{item.label}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onJump(item.key)}
          className="group flex w-full items-center gap-2 py-1.5 text-left"
        >
          <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0 group-hover:border-primary transition-colors" />
          <span className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground">{item.label}</span>
            {item.hint && (
              <span className="block text-[11px] text-muted-foreground leading-snug">{item.hint}</span>
            )}
          </span>
          <span className="flex items-center gap-0.5 text-xs text-primary font-medium shrink-0">
            채우기
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>
      )}
    </li>
  )

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {/* 헤더 + 퍼센트 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-sm">홈페이지 완성도</h2>
            <p className="text-[11px] text-muted-foreground">{doneCount}개 완료 · 전체 {total}개</p>
          </div>
        </div>
        <span className="text-2xl font-black text-primary tabular-nums">{percent}%</span>
      </div>

      {/* 진행바 */}
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>

      {/* 필수 항목 */}
      {essentials.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            기본 정보 (홈페이지 공개에 필요해요)
          </p>
          <ul className="divide-y divide-border/60">{essentials.map(renderRow)}</ul>
        </div>
      )}

      {/* 설득력 강화 항목 */}
      {enrichment.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            설득력 강화 (채울수록 고객이 믿어요)
          </p>
          <ul className="divide-y divide-border/60">{enrichment.map(renderRow)}</ul>
        </div>
      )}
    </div>
  )
}
