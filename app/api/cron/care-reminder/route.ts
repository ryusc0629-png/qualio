import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'

// Vercel Cron(daily-maintenance에서 호출):
// 보고서에 적어둔 '앞으로 손봐야 할 것'의 시점이 되면 사장님에게 알린다.
//
// 왜 이렇게 하나:
// 예전엔 작업 보고서에 '추천 서비스 + 가격 + 견적 문의' 배너를 붙였다. 거래처에 보내는
// 서류에 판촉이 박히면 격이 떨어지고 영업으로만 읽힌다. 그래서 문서에는
// "이 부분이 이랬고 몇 달 뒤엔 이렇게 될 수 있다"만 남기고, 실제로 그 시점이 오면
// 여기서 사장님에게 알려 먼저 연락하게 한다.
// 같은 재방문 유도라도 근거가 그 현장 기록이라 설득력이 다르다.
//
// 같은 건으로 매일 알리지 않도록 care_notified_at을 남긴다.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const looseDb = db as unknown as SupabaseClient

  const { data: due } = (await looseDb
    .from('reports')
    .select('id, business_id, care_advice, bookings!booking_id(customer_name, customer_id)')
    .lte('care_due_at', new Date().toISOString())
    .is('care_notified_at', null)
    .not('care_advice', 'is', null)
    .limit(200)) as unknown as {
    data:
      | Array<{
          id: string
          business_id: string
          care_advice: string | null
          bookings:
            | { customer_name: string | null; customer_id: string | null }
            | { customer_name: string | null; customer_id: string | null }[]
            | null
        }>
      | null
  }

  if (!due || due.length === 0) return NextResponse.json({ notified: 0 })

  // 업체별로 묶어 한 번씩만 알린다 — 같은 날 여러 건이면 폰이 울리기만 한다
  const byBusiness = new Map<string, { count: number; firstName: string; firstId: string | null }>()
  for (const r of due) {
    const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings
    const cur = byBusiness.get(r.business_id)
    if (cur) {
      cur.count++
    } else {
      byBusiness.set(r.business_id, {
        count: 1,
        firstName: b?.customer_name ?? '고객',
        firstId: b?.customer_id ?? null,
      })
    }
  }

  let notified = 0
  for (const [businessId, info] of byBusiness) {
    try {
      await sendPushToBusiness(businessId, {
        title: '다시 연락드릴 때가 됐어요 🔔',
        body: info.count === 1
          ? `${info.firstName}님 현장, 지난 보고서에 적어둔 관리 시점이 됐어요`
          : `${info.count}곳의 관리 시점이 됐어요. 지난 보고서 내용으로 연락해보세요`,
        url: info.count === 1 && info.firstId
          ? `/dashboard/clients/${info.firstId}`
          : '/dashboard/clients',
        tag: 'care-reminder',
      })
      notified++
    } catch (e) {
      console.error('[Cron] care-reminder 푸시 실패:', e)
      // 푸시가 실패해도 아래에서 기록은 남긴다 — 매일 재시도하면 알림만 쌓인다
    }
  }

  await looseDb
    .from('reports')
    .update({ care_notified_at: new Date().toISOString() })
    .in('id', due.map((r) => r.id))

  console.log(`[Cron] care-reminder 완료: ${notified}개 업체, ${due.length}건`)
  return NextResponse.json({ notified, items: due.length })
}
