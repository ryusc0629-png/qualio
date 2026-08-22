'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Lock, ChevronDown, ListChecks, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateContractLockupAction } from '@/lib/actions/contracts'

// 예상 소요 시간 선택지 (30분 단위 · 30분~4시간)
const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240]

function durationLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

type ChecklistItem = { id: string; label: string }

interface Props {
  contractId: string
  requiresLockup: boolean
  expectedDurationMinutes: number | null
  checklistItems?: ChecklistItem[]
  /**
   * 'checklist' — 작업 항목 배지 하나만 그린다.
   * 접힌 카드 줄('자세히' 옆)에 올려 두려고 만든 것. 펼쳐야만 보이면 사장님이 못 찾는다.
   */
  only?: 'checklist'
}

export function ContractLockupCell({
  contractId,
  requiresLockup,
  expectedDurationMinutes,
  checklistItems = [],
  only,
}: Props) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(requiresLockup)
  const [duration, setDuration] = useState(expectedDurationMinutes ?? 120)
  const [items, setItems] = useState<ChecklistItem[]>(checklistItems)
  const [newLabel, setNewLabel] = useState('')

  const { execute, isPending } = useAction(updateContractLockupAction, {
    onSuccess: () => {
      toast.success('현장 설정을 저장했어요!')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // '작업 항목' 배지로 열었으면 그 입력칸에 바로 커서를 둔다 — 스크롤해 찾게 만들지 않는다
  const [focusChecklist, setFocusChecklist] = useState(false)

  // 다이얼로그 열 때 현재 값으로 초기화
  const openDialog = (toChecklist = false) => {
    setChecked(requiresLockup)
    setDuration(expectedDurationMinutes ?? 120)
    setItems(checklistItems)
    setNewLabel('')
    setFocusChecklist(toChecklist)
    setOpen(true)
  }

  const addItem = () => {
    const label = newLabel.trim()
    if (!label) return
    // 클라이언트에서 항목 고유 id 생성 (사진 진행 상황을 이 id로 묶음)
    const id = `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setItems((prev) => [...prev, { id, label }])
    setNewLabel('')
  }

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id))

  return (
    <>
      {/* 배지 두 개 — 문단속과 작업 항목을 따로 보여준다.
          예전엔 자물쇠 배지 하나에 '안 함'만 적혀 있어서, 거기를 눌러야 작업 항목이 나온다는 걸
          알 방법이 없었다. 실제로 운영 DB에서 계약 4건 중 작업 항목을 설정한 곳이 0건,
          항목 사진이 올라온 방문도 385건 중 0건이었다 — 기능은 있는데 문이 안 보였다.
          ⚠️두 배지 모두 같은 창을 연다(설정은 한 곳에서). ⛔새 폼을 따로 만들지 말 것. */}
      <span className="inline-flex flex-wrap items-center gap-1">
        {only !== 'checklist' && (
        <button
          type="button"
          onClick={() => openDialog()}
          className={[
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            requiresLockup
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-muted text-muted-foreground hover:bg-muted/70',
          ].join(' ')}
        >
          <Lock className="h-3 w-3" />
          {requiresLockup
            ? `문단속 · ${durationLabel(expectedDurationMinutes ?? 120)}`
            : '문단속 안 함'}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        )}

        <button
          type="button"
          onClick={() => openDialog(true)}
          className={[
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            checklistItems.length > 0
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100',
          ].join(' ')}
        >
          <ListChecks className="h-3 w-3" />
          {/* 비어 있을 때 회색이 아니라 초록 테두리 — 접힌 줄에서 눈에 띄어야 누른다.
              설정하고 나면 이 배지는 접힌 줄에서 사라지고 '자세히' 안으로 들어간다(잔소리 안 남김) */}
          {checklistItems.length > 0 ? `작업 항목 ${checklistItems.length}개` : '현장에서 할 일 정하기'}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>현장 문단속·작업 항목 설정</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* 문단속 */}
            <div className="space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-amber-500 shrink-0"
                />
                <span className="text-sm leading-snug">
                  이 현장은 <span className="font-semibold">마감 문단속 확인이 필요</span>해요
                  <br />
                  <span className="text-xs text-muted-foreground">
                    직원이 도착·마감 때 잠금 사진을 올리고, 안 올리면 알림이 가요
                  </span>
                </span>
              </label>

              {checked && (
                <div className="space-y-1.5 pl-7">
                  <p className="text-xs font-medium text-muted-foreground">예상 작업 시간</p>
                  <p className="text-xs text-muted-foreground">
                    도착 후 이 시간이 지나도 마감 사진이 없으면 알림이 가요
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {DURATION_OPTIONS.map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setDuration(min)}
                        className={[
                          'px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                          duration === min
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-border text-muted-foreground hover:border-amber-300',
                        ].join(' ')}
                      >
                        {durationLabel(min)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 작업 항목(체크리스트) */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold">이 현장에서 할 일 (작업 매뉴얼)</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                이 현장에 갈 때마다 해야 할 일을 적어두세요. 직원 휴대폰에 그대로 뜨고,
                <b className="text-foreground/70"> 항목마다 사진을 올려야 &lsquo;작업 완료&rsquo;를 누를 수 있어요.</b>
                {' '}빠뜨리는 걸 막고, 거래처에 보낼 사진도 저절로 모입니다. 비워두면 사용 안 해요.
              </p>

              {items.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {items.map((it, i) => (
                    <li key={it.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="flex-1 text-sm truncate">{it.label}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="항목 삭제"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-1.5 pt-1">
                <Input
                  // '작업 항목' 배지로 열었을 때만 자동 포커스 — 문단속으로 열었는데 여기로
                  // 화면이 끌려가면 사장님이 뭘 하려던 건지 잃는다
                  ref={(el) => { if (el && focusChecklist) { el.focus(); el.scrollIntoView({ block: 'center' }) } }}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addItem()
                    }
                  }}
                  placeholder="예: 화장실 바닥, 유리창, 쓰레기 배출"
                  className="h-10 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addItem}
                  className="h-10 shrink-0 px-3"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full h-12"
              disabled={isPending}
              onClick={() =>
                execute({
                  contractId,
                  requiresLockup: checked,
                  expectedDurationMinutes: checked ? duration : undefined,
                  checklistItems: items,
                })
              }
            >
              {isPending ? '저장 중...' : '저장하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
