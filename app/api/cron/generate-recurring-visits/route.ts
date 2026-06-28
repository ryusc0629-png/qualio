import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { generateVisitsForContract, type ContractForGen } from '@/lib/recurring/generate'

// Vercel Cron(daily-maintenance에서 호출): 매일 실행.
// 활성 정기계약을 순회하며 롤링 윈도우(오늘+60일)까지 방문을 일정에 자동 생성한다.
// 매일 한 칸씩 윈도우가 전진해 계약이 살아있는 동안 계속 방문이 채워진다.

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  const { data: contracts, error } = await db
    .from('contracts')
    .select('id, business_id, customer_id, service_type, frequency, start_date, end_date, status, last_generated_until' as never)
    .eq('status', 'active') as unknown as { data: ContractForGen[] | null; error: unknown }

  if (error) {
    console.error('[Cron] generate-recurring-visits 계약 조회 실패:', error)
    return NextResponse.json({ error: '계약 조회 실패' }, { status: 500 })
  }

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ contracts: 0, visits: 0 })
  }

  let totalVisits = 0
  for (const contract of contracts) {
    try {
      totalVisits += await generateVisitsForContract(db as unknown as SupabaseClient, contract)
    } catch (err) {
      console.error(`[Cron] generate-recurring-visits 실패 contract=${contract.id}:`, err)
    }
  }

  console.log(`[Cron] generate-recurring-visits — 계약 ${contracts.length}건 / 새 방문 ${totalVisits}건`)

  return NextResponse.json({ contracts: contracts.length, visits: totalVisits })
}
