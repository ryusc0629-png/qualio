import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { countPendingOnboardingReports } from '@/lib/onboarding/pending-reports'

// Vercel Cron(daily-maintenance에서 호출):
// 첫 작업이 끝났는데 초도 리포트를 아직 안 보낸 정기계약을 찾아 대표에게 푸시한다.
//
// 왜 필요한가: 초도 리포트는 정기 거래처와의 첫인상을 만드는 문서인데,
// 진입점이 고객 상세 안쪽 링크뿐이라 사장님이 기억해서 찾아 들어가야 했다.
//
// 계약당 한 번만 알린다(contracts.onboarding_report_pinged_at) — 보낼 때까지 조건에
// 계속 걸리는 구조라, 기록을 안 남기면 매일 같은 푸시가 가서 알림을 꺼버리게 된다.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const looseDb = db as unknown as SupabaseClient

  // 활성 정기계약이 있는 업체만 훑는다
  const { data: rows } = (await looseDb
    .from('contracts')
    .select('business_id')
    .eq('status', 'active')) as unknown as { data: { business_id: string }[] | null }

  const businessIds = [...new Set((rows ?? []).map((r) => r.business_id))]
  if (businessIds.length === 0) return NextResponse.json({ pushed: 0 })

  let pushed = 0
  let skipped = 0

  for (const businessId of businessIds) {
    const pending = await countPendingOnboardingReports(looseDb, businessId)
    if (pending.length === 0) continue

    // 아직 안 알린 계약만 — 이미 한 번 알린 건 조용히 넘어간다
    const { data: pingedRows } = (await looseDb
      .from('contracts')
      .select('id')
      .in('id', pending.map((p) => p.contractId))
      .not('onboarding_report_pinged_at', 'is', null)) as unknown as { data: { id: string }[] | null }

    const alreadyPinged = new Set((pingedRows ?? []).map((r) => r.id))
    const fresh = pending.filter((p) => !alreadyPinged.has(p.contractId))

    if (fresh.length === 0) {
      skipped++
      continue
    }

    try {
      await sendPushToBusiness(businessId, {
        title: '첫 작업 리포트를 보낼 차례예요 📄',
        body: fresh.length === 1
          ? `${fresh[0].customerName} 첫 작업 기록을 미리 넣어뒀어요. 손보고 보내주세요`
          : `${fresh.length}곳의 첫 작업 리포트가 준비됐어요. 손보고 보내주세요`,
        url: fresh.length === 1
          ? `/dashboard/contracts/${fresh[0].contractId}/onboarding-report`
          : '/dashboard',
        tag: 'onboarding-report-reminder',
      })
      pushed++
    } catch (e) {
      console.error('[Cron] onboarding-report-reminder 푸시 실패:', e)
      // 푸시가 실패해도 아래에서 기록은 남긴다 —
      // 매일 재시도하면 대표 폰에 같은 알림이 쌓이기만 한다
    }

    await looseDb
      .from('contracts')
      .update({ onboarding_report_pinged_at: new Date().toISOString() })
      .in('id', fresh.map((p) => p.contractId))
  }

  console.log(`[Cron] onboarding-report-reminder 완료: 푸시 ${pushed}곳, 이미 알림 ${skipped}곳`)
  return NextResponse.json({ pushed, skipped })
}
