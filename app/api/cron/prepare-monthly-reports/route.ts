import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'

// Vercel Cron(daily-maintenance에서 호출): 매일 실행되지만 '지난달' 리포트만 준비한다.
// 정기계약이 살아있고 지난달 완료 방문이 1건 이상인 거래처마다 '검토 대기(pending)' 리포트를 준비한다.
// (business_id, customer_id, period) 유니크 제약으로 재실행해도 중복 생성되지 않는다(멱등).
// 새로 준비된 건이 있는 업체 대표에게만 푸시로 "검토해서 보내주세요"를 알린다.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  // monthly_report_dispatches는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
  const looseDb = db as unknown as SupabaseClient

  // 대상 기간 = 지난달(KST). 새 달로 넘어간 첫 실행에서 자동으로 준비된다.
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const prevMonthDate = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth() - 1, 1))
  const py = prevMonthDate.getUTCFullYear()
  const pm = prevMonthDate.getUTCMonth() // 0-based
  const period = `${py}-${String(pm + 1).padStart(2, '0')}`
  // 지난달 범위(UTC ISO) — KST 1일 00:00 ~ 다음 달 1일 00:00
  const startISO = new Date(Date.UTC(py, pm, 1, 0, 0) - 9 * 60 * 60 * 1000).toISOString()
  const endISO = new Date(Date.UTC(py, pm + 1, 1, 0, 0) - 9 * 60 * 60 * 1000).toISOString()

  // 활성 정기계약 → 대상 거래처(고객) 목록
  const { data: contracts } = (await db
    .from('contracts')
    .select('business_id, customer_id')
    .eq('status', 'active')) as unknown as {
    data: { business_id: string; customer_id: string }[] | null
  }

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ period, prepared: 0, businesses: 0 })
  }

  // (business_id, customer_id) 중복 제거
  const targets = new Map<string, { business_id: string; customer_id: string }>()
  for (const c of contracts) {
    targets.set(`${c.business_id}_${c.customer_id}`, c)
  }

  // 이미 이 기간 준비된 (customer) 건은 건너뛰기 위해 조회
  const customerIds = [...targets.values()].map((t) => t.customer_id)
  const { data: existing } = (await looseDb
    .from('monthly_report_dispatches')
    .select('customer_id')
    .eq('period', period)
    .in('customer_id', customerIds)) as unknown as { data: { customer_id: string }[] | null }
  const alreadyPrepared = new Set((existing ?? []).map((e) => e.customer_id))

  const newByBusiness = new Map<string, number>()
  let prepared = 0

  for (const { business_id, customer_id } of targets.values()) {
    if (alreadyPrepared.has(customer_id)) continue

    // 지난달 완료 방문 수 — 1건 이상일 때만 준비(보낼 내용이 있어야 함)
    const { count } = (await db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .eq('customer_id', customer_id)
      .eq('status', 'completed')
      .gte('scheduled_at', startISO)
      .lt('scheduled_at', endISO)) as unknown as { count: number | null }

    const completed = count ?? 0
    if (completed === 0) continue

    const { error: insErr } = await looseDb.from('monthly_report_dispatches').insert({
      business_id,
      customer_id,
      period,
      status: 'pending',
      completed_visits: completed,
    })

    // 유니크 충돌(동시 실행)은 무시
    if (insErr) {
      if (!String(insErr.message || '').includes('duplicate')) {
        console.error('[Cron] prepare-monthly-reports 삽입 실패:', insErr)
      }
      continue
    }

    prepared++
    newByBusiness.set(business_id, (newByBusiness.get(business_id) ?? 0) + 1)
  }

  // 새로 준비된 건이 있는 업체 대표에게 푸시
  const [, prevMonthName] = period.split('-')
  let pushed = 0
  for (const [businessId, cnt] of newByBusiness) {
    try {
      await sendPushToBusiness(businessId, {
        title: '보낼 거래처 리포트가 준비됐어요 📄',
        body: `${Number(prevMonthName)}월 작업 리포트 ${cnt}건이 준비됐어요. 검토하고 보내주세요`,
        url: '/dashboard/monthly-reports',
        tag: 'monthly-report-prepare',
      })
      pushed++
    } catch (err) {
      console.error(`[Cron] prepare-monthly-reports 푸시 실패 business=${businessId}:`, err)
    }
  }

  console.log(`[Cron] prepare-monthly-reports — 기간 ${period} / 준비 ${prepared}건 / 푸시 ${pushed}업체`)
  return NextResponse.json({ period, prepared, businesses: pushed })
}
