'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AddressField } from '@/components/ui/address-field'
import { FileText, CheckCircle2, RotateCcw } from 'lucide-react'
import {
  saveSubcontractorContractAction,
  setSubcontractorContractSignedAction,
} from '@/lib/actions/subcontractor-contract'
import type {
  ContractParty,
  SettlementMode,
  SubcontractorContractData,
} from '@/lib/contract/subcontractor-contract'

// 010-1234-5678 꼴로 다듬기
function formatPhone(v: string): string {
  const n = v.replace(/[^0-9]/g, '').slice(0, 11)
  if (n.length < 4) return n
  if (n.length < 8) return `${n.slice(0, 3)}-${n.slice(3)}`
  return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`
}

// 넣을지 뺄지 고르는 조항 — 끄면 계약서에서 그 조가 통째로 빠지고 뒤 번호가 당겨진다
function ToggleClause({
  checked,
  onToggle,
  title,
  hint,
}: {
  checked: boolean
  onToggle: () => void
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={[
        'w-full rounded-lg border p-3 text-left transition-colors',
        checked ? 'border-primary bg-primary/5' : 'border-border',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        <span
          className={[
            'w-4 h-4 rounded border flex items-center justify-center shrink-0',
            checked ? 'bg-primary border-primary' : 'border-muted-foreground/40',
          ].join(' ')}
        >
          {checked && <CheckCircle2 className="h-3 w-3 text-white" />}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </span>
      <span className="block text-xs text-muted-foreground mt-1 pl-6">{hint}</span>
    </button>
  )
}

const SETTLEMENT_OPTIONS: { value: SettlementMode; label: string; hint: string }[] = [
  { value: 'revenue_share', label: '매출 나누기', hint: '매출의 몇 %를 내 몫으로' },
  { value: 'per_job',       label: '건당 단가',   hint: '한 건 끝낼 때마다 얼마' },
  { value: 'per_day',       label: '일당 단가',   hint: '한 사람 하루에 얼마' },
]

export function ContractForm({
  workerId,
  workerName,
  initial,
  signedAt,
  hasSaved,
}: {
  workerId: string
  workerName: string
  initial: SubcontractorContractData
  signedAt: string | null
  hasSaved: boolean
}) {
  // 이 옵션이 생기기 전에 저장된 계약서에는 값이 없다 — '넣음'으로 채워 서버 검증에 걸리지 않게 한다
  const [d, setD] = useState<SubcontractorContractData>({
    ...initial,
    includeGrowthSupport: initial.includeGrowthSupport !== false,
  })
  const [saved, setSaved] = useState(hasSaved)

  const set = <K extends keyof SubcontractorContractData>(k: K, v: SubcontractorContractData[K]) =>
    setD((prev) => ({ ...prev, [k]: v }))

  const setParty = (side: 'partyA' | 'partyB', k: keyof ContractParty, v: string) =>
    setD((prev) => ({ ...prev, [side]: { ...prev[side], [k]: v } }))

  // '계약서 보기'는 저장이 끝난 뒤에 넘어가야 방금 고친 내용이 반영된다
  const [goPrintAfterSave, setGoPrintAfterSave] = useState(false)

  const { execute: save, isPending: saving } = useAction(saveSubcontractorContractAction, {
    onSuccess: () => {
      setSaved(true)
      if (goPrintAfterSave) {
        window.location.replace(`/dashboard/contractors/${workerId}/print`)
        return
      }
      toast.success('저장됐어요!')
    },
    onError: ({ error }) => {
      setGoPrintAfterSave(false)
      toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요')
    },
  })

  const { execute: setSigned, isPending: signing } = useAction(setSubcontractorContractSignedAction, {
    onSuccess: () => window.location.replace(window.location.href),
    onError: ({ error }) => toast.error(error.serverError ?? '처리 못 했어요. 다시 눌러주세요'),
  })

  const payload = { workerId, ...d, includeGrowthSupport: d.includeGrowthSupport !== false }

  return (
    <div className="space-y-4 pb-28">
      {signedAt && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">계약 완료로 표시돼 있어요</p>
            <p className="text-xs mt-0.5">
              {new Date(signedAt).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul',
              })}{' '}
              체결 · 내용을 고치면 다시 저장해주세요
            </p>
          </div>
        </div>
      )}

      {/* 갑 — 내 업체 */}
      <section className="rounded-xl border p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">갑 — 우리 업체 (영업 담당)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">거래처를 따오고 견적을 내는 쪽이에요</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">상호</Label>
          <Input
            value={d.partyA.company}
            onChange={(e) => setParty('partyA', 'company', e.target.value)}
            placeholder="다트클린"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">대표</Label>
          <Input
            value={d.partyA.ceo}
            onChange={(e) => setParty('partyA', 'ceo', e.target.value)}
            placeholder="홍길동"
          />
        </div>
        <AddressField
          value={d.partyA.address}
          onChange={(v) => setParty('partyA', 'address', v)}
          label="주소"
          className="space-y-1"
        />
        <div className="space-y-1">
          <Label className="text-xs">연락처</Label>
          <Input
            value={d.partyA.phone}
            inputMode="tel"
            onChange={(e) => setParty('partyA', 'phone', formatPhone(e.target.value))}
            placeholder="010-1234-5678"
          />
        </div>
      </section>

      {/* 을 — 도급사 */}
      <section className="rounded-xl border p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">을 — {workerName} (실행 담당)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">현장에서 실제 청소를 하는 쪽이에요</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">상호</Label>
          <Input
            value={d.partyB.company}
            onChange={(e) => setParty('partyB', 'company', e.target.value)}
            placeholder="베이스케어"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">대표</Label>
          <Input
            value={d.partyB.ceo}
            onChange={(e) => setParty('partyB', 'ceo', e.target.value)}
            placeholder="박진"
          />
        </div>
        <AddressField
          value={d.partyB.address}
          onChange={(v) => setParty('partyB', 'address', v)}
          label="주소"
          className="space-y-1"
        />
        <div className="space-y-1">
          <Label className="text-xs">연락처</Label>
          <Input
            value={d.partyB.phone}
            inputMode="tel"
            onChange={(e) => setParty('partyB', 'phone', formatPhone(e.target.value))}
            placeholder="010-1234-5678"
          />
        </div>
      </section>

      {/* 정산 */}
      <section className="rounded-xl border p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-sm">돈은 어떻게 나눌까요</h2>
          <p className="text-xs text-muted-foreground mt-0.5">고른 방식에 맞게 계약서 제4조가 바뀌어요</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {SETTLEMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('settlementMode', opt.value)}
              className={[
                'rounded-lg border p-2.5 text-left transition-colors',
                d.settlementMode === opt.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50',
              ].join(' ')}
            >
              <span className={['block text-sm font-semibold', d.settlementMode === opt.value ? 'text-primary' : ''].join(' ')}>
                {opt.label}
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5 leading-tight">
                {opt.hint}
              </span>
            </button>
          ))}
        </div>

        {d.settlementMode === 'revenue_share' ? (
          <div className="space-y-1">
            <Label className="text-xs">우리(갑) 몫 (%)</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={d.sharePercent ?? ''}
              onChange={(e) => set('sharePercent', e.target.value === '' ? null : Number(e.target.value))}
              placeholder="20"
            />
            <p className="text-xs text-muted-foreground">
              {typeof d.sharePercent === 'number'
                ? `우리 ${d.sharePercent}% · ${workerName} ${100 - d.sharePercent}%`
                : '보통 20% 안팎으로 정해요'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs">
              {d.settlementMode === 'per_job' ? '한 건당 지급 금액 (원)' : '1인 하루 지급 금액 (원)'}
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={d.unitPrice ?? ''}
              onChange={(e) => set('unitPrice', e.target.value === '' ? null : Number(e.target.value))}
              placeholder={d.settlementMode === 'per_job' ? '150000' : '130000'}
            />
            {typeof d.unitPrice === 'number' && d.unitPrice > 0 && (
              <p className="text-xs text-muted-foreground">
                {d.unitPrice.toLocaleString('ko-KR')}원
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">정산 마감</Label>
            <Input
              value={d.closingDay}
              onChange={(e) => set('closingDay', e.target.value)}
              placeholder="매월 말일"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">익월 지급일</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={d.payDay ?? ''}
              onChange={(e) => set('payDay', e.target.value === '' ? null : Number(e.target.value))}
              placeholder="10"
            />
          </div>
        </div>
      </section>

      {/* 조건 */}
      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold text-sm">계약 조건</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">공동 비용·손해 분담 (우리 %)</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={d.lossSplitPercent}
              onChange={(e) => set('lossSplitPercent', Number(e.target.value || 0))}
            />
            <p className="text-xs text-muted-foreground">
              우리 {d.lossSplitPercent}% · {workerName} {100 - d.lossSplitPercent}%
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">계약 기간 (개월)</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={d.termMonths}
              onChange={(e) => set('termMonths', Number(e.target.value || 12))}
            />
            <p className="text-xs text-muted-foreground">만료 30일 전 통지 없으면 자동 갱신</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">계약 체결일</Label>
          <Input
            type="date"
            value={d.contractDate ?? ''}
            onChange={(e) => set('contractDate', e.target.value || null)}
          />
          <p className="text-xs text-muted-foreground">비워두면 계약서에 빈칸으로 나와 손으로 적을 수 있어요</p>
        </div>

        <ToggleClause
          checked={d.includeGrowthSupport !== false}
          onToggle={() => set('includeGrowthSupport', d.includeGrowthSupport === false)}
          title="영업 노하우 알려주기 조항 넣기"
          hint={`우리 영업·마케팅 자료와 방법을 ${workerName}에 아낌없이 알려주고, 혼자서도 할 수 있게 키워주겠다는 약속이에요. 부담되면 꺼두세요 — 끄면 '용역에 필요한 정보는 주되, 나머지는 그때그때 협의한다'로 바뀝니다.`}
        />

        <ToggleClause
          checked={d.includeTransferOption}
          onToggle={() => set('includeTransferOption', !d.includeTransferOption)}
          title="영업권 넘기기 조항 넣기"
          hint="나중에 이 도급사에게 거래처를 통째로 넘길 수 있는 우선권과 권리금 조항이에요. 필요 없으면 꺼두세요."
        />

        <div className="space-y-1">
          <Label className="text-xs">특약 사항</Label>
          <Textarea
            value={d.specialTerms ?? ''}
            onChange={(e) => set('specialTerms', e.target.value || null)}
            placeholder="따로 약속한 내용이 있으면 적어주세요 (예: 자재는 갑이 공급한다)"
            className="min-h-[90px]"
          />
          <p className="text-xs text-muted-foreground">적은 내용은 계약서 맨 뒤에 들어가고 본문보다 우선해요</p>
        </div>
      </section>

      {/* 날인본 회수 처리 */}
      {saved && (
        <section className="rounded-xl border p-4 space-y-2">
          <h2 className="font-semibold text-sm">날인본을 받으셨나요?</h2>
          <p className="text-xs text-muted-foreground">
            계약서를 PDF로 보내고 도장 찍은 걸 돌려받으면 완료로 표시해주세요. 도급사 목록에 초록색 &lsquo;계약 완료&rsquo;로 바뀌어요.
          </p>
          {signedAt ? (
            <Button
              variant="outline"
              className="w-full h-12 gap-1.5"
              disabled={signing}
              onClick={() => {
                if (confirm('계약 완료 표시를 지울까요?')) setSigned({ workerId, signed: false })
              }}
            >
              <RotateCcw className="h-4 w-4" />
              {signing ? '처리 중...' : '완료 표시 지우기'}
            </Button>
          ) : (
            <Button
              className="w-full h-12 gap-1.5"
              disabled={signing}
              onClick={() => setSigned({ workerId, signed: true })}
            >
              <CheckCircle2 className="h-4 w-4" />
              {signing ? '처리 중...' : '계약 완료로 표시하기'}
            </Button>
          )}
        </section>
      )}

      {/* 하단 고정 액션 — 모바일 홈바에 가리지 않게 여백 확보 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto flex gap-2">
          <Button
            variant="outline"
            className="h-12 flex-1 gap-1.5"
            disabled={saving}
            onClick={() => {
              // 계약서는 저장된 내용으로 그리므로, 저장을 먼저 끝내고 넘어간다
              setGoPrintAfterSave(true)
              save(payload)
            }}
          >
            <FileText className="h-4 w-4" />
            {saving && goPrintAfterSave ? '여는 중...' : '계약서 보기'}
          </Button>
          <Button
            className="h-12 flex-1"
            disabled={saving}
            onClick={() => save(payload)}
          >
            {saving ? '저장 중...' : '저장하기'}
          </Button>
        </div>
      </div>
    </div>
  )
}
