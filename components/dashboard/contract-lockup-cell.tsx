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
}

export function ContractLockupCell({
  contractId,
  requiresLockup,
  expectedDurationMinutes,
  checklistItems = [],
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

  // 다이얼로그 열 때 현재 값으로 초기화
  const openDialog = () => {
    setChecked(requiresLockup)
    setDuration(expectedDurationMinutes ?? 120)
    setItems(checklistItems)
    setNewLabel('')
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
      <button
        type="button"
        onClick={openDialog}
        className={[
          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
          requiresLockup
            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            : 'bg-muted text-muted-foreground hover:bg-muted/70',
        ].join(' ')}
      >
        <Lock className="h-3 w-3" />
        {requiresLockup
          ? `필요 · ${durationLabel(expectedDurationMinutes ?? 120)}`
          : '안 함'}
        {checklistItems.length > 0 && (
          <span className="ml-0.5 inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
            <ListChecks className="h-3 w-3" />
            {checklistItems.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

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
                <p className="text-sm font-semibold">작업 항목 (사진으로 확인)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                직원이 각 항목마다 사진을 올려야 &lsquo;작업 완료&rsquo;를 누를 수 있어요. 비워두면 사용 안 함.
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
