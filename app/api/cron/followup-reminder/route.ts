import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'

// Vercel Cron(daily-maintenance에서 호출): 매일 01:00 UTC (KST 오전 10시) 실행.
// 오늘(또는 지난) 연락 예정인 거래처가 있는 업체의 대표 폰에 푸시로 알린다.
// 지금은 대시보드를 직접 열어야만 '연락할 거래처'를 볼 수 있어 연락 누락이 발생 → 매출 손실.
// 종결(계약/포기/보관) 상태는 제외한다.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // KST 기준 오늘 날짜 (YYYY-MM-DD) — next_follow_up_date(date 타입)와 직접 비교
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayKSTStr = nowKST.toISOString().slice(0, 10)

  // 오늘 이하로 연락 예정이면서 아직 종결되지 않은 리드
  const { data: dueLeads, error } = await db
    .from('leads')
    .select('business_id, next_follow_up_date, status')
    .lte('next_follow_up_date', todayKSTStr)
    .not('next_follow_up_date', 'is', null)
    .not('status', 'in', '("contracted","rejected","archived")')

  if (error) {
    console.error('[Cron] followup-reminder 리드 조회 실패:', error)
    return NextResponse.json({ error: '리드 조회 실패' }, { status: 500 })
  }

  if (!dueLeads || dueLeads.length === 0) {
    return NextResponse.json({ businesses: 0, leads: 0 })
  }

  // 업체별 연락 대상 수 집계
  const countByBusiness = new Map<string, number>()
  for (const lead of dueLeads) {
    countByBusiness.set(lead.business_id, (countByBusiness.get(lead.business_id) ?? 0) + 1)
  }

  let pushed = 0
  for (const [businessId, count] of countByBusiness) {
    try {
      await sendPushToBusiness(businessId, {
        title: '오늘 연락할 거래처가 있어요 📞',
        body:
          count === 1
            ? '거래처 1곳 연락 예정이에요. 놓치기 전에 확인하세요'
            : `거래처 ${count}곳 연락 예정이에요. 놓치기 전에 확인하세요`,
        url: '/dashboard',
        // 같은 tag → 매일 새 알림이 쌓이지 않고 최신 것으로 갱신
        tag: 'followup-reminder',
      })
      pushed++
    } catch (err) {
      console.error(`[Cron] followup-reminder 푸시 실패 business=${businessId}:`, err)
    }
  }

  console.log(`[Cron] followup-reminder — 푸시: ${pushed}개 업체 / 대상 리드: ${dueLeads.length}건`)

  return NextResponse.json({ businesses: pushed, leads: dueLeads.length })
}
