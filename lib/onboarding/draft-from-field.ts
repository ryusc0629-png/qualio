import type { SupabaseClient } from '@supabase/supabase-js'
import { newOnboardingItem, type OnboardingItem } from '@/lib/onboarding/types'

// 현장 직원이 쓴 '첫 방문 보고서'로 초도 리포트 초안을 만든다.
//
// 왜 이렇게 하는가:
// 초도 리포트는 거래처와의 첫인상을 만드는 문서인데 전부 손으로 써야 했다.
// 그런데 직원은 이미 첫 방문에서 메모·특이사항·전후 사진을 앱에 남긴다.
// 그 기록으로 초안을 깔아두면 사장님은 손보기만 하면 된다.
//
// ⚠️ 직원 앱에는 아무 입력도 추가하지 않는다. 직원이 할 일이 늘면 안 쓰게 되고,
//    그러면 초안도 안 생긴다. 지금 쓰는 것만으로 만들 수 있는 만큼만 만든다.
//    (어느 공간인지는 현장에서 안 받으므로 비워두고 사장님이 채운다)
//
// 초안은 draft 상태로만 만든다 — 거래처에 나가는 건 사장님이 검토하고 누를 때뿐이다.

interface FieldReportRow {
  id: string
  notes: string | null
  preventive_note: string | null
}

/** 이 예약이 계약의 '첫 번째 완료 방문'인지 — 초도 리포트는 계약당 한 번뿐이다 */
export async function isFirstVisitOfContract(
  db: SupabaseClient,
  businessId: string,
  contractId: string,
  bookingId: string,
): Promise<boolean> {
  const { data: first } = (await db
    .from('bookings')
    .select('id')
    .eq('business_id', businessId)
    .eq('contract_id', contractId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()) as unknown as { data: { id: string } | null }

  return first?.id === bookingId
}

/** 현장 보고서 → 초도 리포트 항목. 전/후 사진을 순서대로 짝지어 한 항목으로 묶는다 */
async function buildDraft(
  db: SupabaseClient,
  fieldReport: FieldReportRow,
): Promise<{ beforeNote: string; items: OnboardingItem[] }> {
  const { data: photos } = (await db
    .from('report_photos')
    .select('url, type, sort_order')
    .eq('report_id', fieldReport.id)
    .order('sort_order', { ascending: true })) as unknown as {
    data: { url: string; type: string; sort_order: number }[] | null
  }

  const before = (photos ?? []).filter((p) => p.type === 'before').map((p) => p.url)
  const after = (photos ?? []).filter((p) => p.type === 'after').map((p) => p.url)

  // 전·후 장수가 안 맞아도 된다 — 있는 쪽만 채우고 없는 쪽은 비워둔다.
  // (전만 찍은 곳, 후만 찍은 곳 모두 정상이다)
  const count = Math.max(before.length, after.length)
  const items: OnboardingItem[] = Array.from({ length: count }, (_, i) => ({
    ...newOnboardingItem(),
    space: '', // 현장에서 안 받는 유일한 값 — 사장님이 채운다
    problem: i === 0 ? (fieldReport.preventive_note ?? '') : '',
    beforeUrl: before[i] ?? null,
    afterUrl: after[i] ?? null,
  }))

  return { beforeNote: fieldReport.notes ?? '', items }
}

/**
 * 첫 방문 보고서가 저장되면 초도 리포트 초안을 만들어 둔다.
 *
 * - 이미 초도 리포트가 있으면 아무것도 하지 않는다(사장님이 손본 내용을 덮지 않는다)
 * - 정기계약 방문이 아니거나 첫 방문이 아니면 아무것도 하지 않는다
 * - 실패해도 조용히 넘어간다 — 보고서 저장을 막을 이유가 없다
 */
export async function ensureOnboardingDraft(params: {
  db: SupabaseClient
  businessId: string
  bookingId: string
  contractId: string | null
  reportId: string
}): Promise<boolean> {
  const { db, businessId, bookingId, contractId, reportId } = params
  if (!contractId) return false

  try {
    const { data: existing } = (await db
      .from('onboarding_reports')
      .select('id')
      .eq('business_id', businessId)
      .eq('contract_id', contractId)
      .maybeSingle()) as unknown as { data: { id: string } | null }

    if (existing) return false

    if (!(await isFirstVisitOfContract(db, businessId, contractId, bookingId))) return false

    const { data: fieldReport } = (await db
      .from('reports')
      .select('id, notes, preventive_note')
      .eq('id', reportId)
      .maybeSingle()) as unknown as { data: FieldReportRow | null }

    if (!fieldReport) return false

    const { data: contract } = (await db
      .from('contracts')
      .select('customer_id')
      .eq('id', contractId)
      .maybeSingle()) as unknown as { data: { customer_id: string } | null }

    if (!contract) return false

    const { beforeNote, items } = await buildDraft(db, fieldReport)
    // 적을 게 하나도 없으면 빈 초안을 만들지 않는다 — 홈에 헛알림이 뜬다
    if (!beforeNote.trim() && items.length === 0) return false

    const { error } = await db.from('onboarding_reports').insert({
      business_id: businessId,
      contract_id: contractId,
      customer_id: contract.customer_id,
      before_note: beforeNote,
      items,
      status: 'draft',
    })

    if (error) {
      // 동시 저장으로 이미 만들어졌으면 정상 — 조용히 넘어간다
      if (!String(error.message ?? '').includes('duplicate')) {
        console.error('[Onboarding] 초안 생성 실패:', error)
      }
      return false
    }

    return true
  } catch (e) {
    console.error('[Onboarding] 초안 생성 중 오류:', e)
    return false
  }
}

/** 사장님이 '현장 기록 다시 불러오기'를 눌렀을 때 — 기존 초안 위에 현장 값만 덮어쓴다 */
export async function rebuildOnboardingDraft(params: {
  db: SupabaseClient
  businessId: string
  contractId: string
}): Promise<{ beforeNote: string; items: OnboardingItem[] } | null> {
  const { db, businessId, contractId } = params

  const { data: firstVisit } = (await db
    .from('bookings')
    .select('id')
    .eq('business_id', businessId)
    .eq('contract_id', contractId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()) as unknown as { data: { id: string } | null }

  if (!firstVisit) return null

  const { data: fieldReport } = (await db
    .from('reports')
    .select('id, notes, preventive_note')
    .eq('booking_id', firstVisit.id)
    .maybeSingle()) as unknown as { data: FieldReportRow | null }

  if (!fieldReport) return null

  return buildDraft(db, fieldReport)
}
