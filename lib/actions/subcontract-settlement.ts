'use server'

// 도급 정산을 장부(매출·지출)에 확정 기입한다.
//
// 화면에 보이는 금액은 항상 계산 결과(실시간)이고, 장부에는 사장님이 '확정'을 누른 달만 들어간다.
// 자동 기입분은 source_key로 표시해 두므로 같은 달을 다시 확정해도 줄이 늘지 않고 금액만 갱신된다.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { loadContractorSettlements } from '@/lib/finance/subcontract-load'
import {
  SUBCONTRACT_EXPENSE_CATEGORY,
  settlementSourceKey,
} from '@/lib/finance/subcontract-settlement'
import { SETTLEMENT_LABELS } from '@/lib/contract/subcontractor-contract'

async function getBusinessId() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) throw new Error('[APP] 로그인이 필요합니다')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')
  return { db, businessId: profile.business_id }
}

const schema = z.object({
  workerId: z.string().uuid(),
  month: z.string().refine((v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v), '달을 다시 골라주세요'),
})

/** 'YYYY-MM' → 그 달 마지막날. 계약서 정산 기준(매월 말일)에 맞춰 장부 날짜로 쓴다 */
function monthLastDay(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

// ── 확정 기입 ────────────────────────────────────────────────
export const postSubcontractSettlementAction = action
  .schema(schema)
  .action(async ({ parsedInput: { workerId, month } }) => {
    const { db, businessId } = await getBusinessId()

    const settlements = await loadContractorSettlements(db, businessId, month)
    const s = settlements.find((x) => x.workerId === workerId)
    if (!s) throw new Error('[APP] 도급사를 찾을 수 없습니다')
    if (s.result.blocked) throw new Error(`[APP] ${s.result.blocked}`)
    if (s.result.revenue <= 0) throw new Error('[APP] 이 달에는 정산할 현장이 없어요')

    const entryDate = monthLastDay(month)
    const monthLabel = `${Number(month.slice(5, 7))}월`
    const modeLabel = s.result.mode ? SETTLEMENT_LABELS[s.result.mode] : '도급'
    const shareLabel =
      s.result.mode === 'revenue_share' && s.result.sharePercent !== null
        ? ` ${100 - s.result.sharePercent}%`
        : ''

    interface LedgerLine {
      source_key: string
      type: 'revenue' | 'expense'
      category: string
      amount: number
      memo: string
    }

    const rows: LedgerLine[] = []
    if (s.result.recurringRevenue > 0) {
      rows.push({
        source_key: settlementSourceKey(workerId, month, 'recurring'),
        type: 'revenue',
        category: '정기청소',
        amount: s.result.recurringRevenue,
        memo: `${s.workerName} ${monthLabel} 정기청소 매출`,
      })
    }
    if (s.result.oneOffRevenue > 0) {
      rows.push({
        source_key: settlementSourceKey(workerId, month, 'oneoff'),
        type: 'revenue',
        category: '기타 매출',
        amount: s.result.oneOffRevenue,
        memo: `${s.workerName} ${monthLabel} 일회성 현장 매출`,
      })
    }
    // 실제로 나가는 돈은 배분분 + 급여 관리에서 얹은 추가 지급이다.
    // 추가 지급을 빼고 넣으면 그만큼이 장부에서 조용히 샌다.
    if (s.result.totalPay > 0) {
      const extraNote = s.result.extraPay !== 0 ? ` + 추가 지급 ${s.result.extraPay.toLocaleString('ko-KR')}원` : ''
      rows.push({
        source_key: settlementSourceKey(workerId, month, 'pay'),
        type: 'expense',
        category: SUBCONTRACT_EXPENSE_CATEGORY,
        amount: s.result.totalPay,
        memo: `${s.workerName} ${monthLabel} 도급비 · ${modeLabel}${shareLabel}${extraNote}`,
      })
    }

    const keys = (['recurring', 'oneoff', 'pay'] as const).map((k) =>
      settlementSourceKey(workerId, month, k),
    )

    // 지우고 다시 넣는다 — 재확정 시 금액이 바뀌거나 줄이 없어지는 경우까지 한 번에 맞춘다
    const { error: delError } = await db
      .from('finance_entries')
      .delete()
      .eq('business_id', businessId)
      .in('source_key' as never, keys)
    if (delError) {
      console.error('[Subcontract] 기존 자동 기입 정리 실패:', delError)
      throw new Error('[APP] 장부에 넣지 못했어요. 다시 눌러주세요')
    }

    const { error } = await db.from('finance_entries').insert(
      rows.map((r) => ({
        business_id: businessId,
        entry_date: entryDate,
        type: r.type,
        category: r.category,
        amount: r.amount,
        memo: r.memo,
        source: 'subcontract',
        source_key: r.source_key,
      })) as never,
    )
    if (error) {
      console.error('[Subcontract] 장부 기입 실패:', error)
      throw new Error('[APP] 장부에 넣지 못했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    revalidatePath(`/dashboard/contractors/${workerId}`)
    return { success: true, lines: rows.length }
  })

// ── 확정 취소(장부에서 빼기) ─────────────────────────────────
export const unpostSubcontractSettlementAction = action
  .schema(schema)
  .action(async ({ parsedInput: { workerId, month } }) => {
    const { db, businessId } = await getBusinessId()

    const keys = (['recurring', 'oneoff', 'pay'] as const).map((k) =>
      settlementSourceKey(workerId, month, k),
    )

    const { error } = await db
      .from('finance_entries')
      .delete()
      .eq('business_id', businessId)
      .in('source_key' as never, keys)

    if (error) {
      console.error('[Subcontract] 장부에서 빼기 실패:', error)
      throw new Error('[APP] 빼지 못했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/finance')
    revalidatePath(`/dashboard/contractors/${workerId}`)
    return { success: true }
  })
