'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendMonthlyReportAlimtalk } from '@/lib/kakao/alimtalk'

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

// 리포트 발송 처리(사장님이 검토 후 '발송' 클릭)
//
// 템플릿(SOLAPI_TEMPLATE_ID_MONTHLY_REPORT)이 설정돼 있으면 거래처에 알림톡을 보내고,
// 아직 심사 중이라 설정이 없으면 예전처럼 '검토 완료'로만 표시한다(사장님이 링크를 직접 전달).
// 승인 후 환경변수만 넣으면 코드 수정 없이 자동 발송으로 바뀐다.
export const sendMonthlyReportAction = action
  .schema(z.object({ dispatchId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    // monthly_report_dispatches는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
    const looseDb = db as unknown as SupabaseClient

    const { data: dispatch } = await looseDb
      .from('monthly_report_dispatches')
      .select('status, period, completed_visits, customer_id, customers!customer_id(name, phone), businesses!business_id(name)')
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as {
        data: {
          status: string
          period: string
          completed_visits: number | null
          customer_id: string
          customers: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
          businesses: { name: string } | { name: string }[] | null
        } | null
      }

    if (!dispatch) throw new Error('[APP] 리포트를 찾을 수 없습니다')
    if (dispatch.status !== 'pending') throw new Error('[APP] 이미 처리된 리포트예요')

    // 거래처에 알림톡 발송 — 템플릿이 없으면 조용히 건너뛰고 '검토 완료'로만 남는다
    const customer = Array.isArray(dispatch.customers) ? dispatch.customers[0] : dispatch.customers
    const biz      = Array.isArray(dispatch.businesses) ? dispatch.businesses[0] : dispatch.businesses
    let alimtalkSent = false
    if (customer?.phone) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
        // period는 'YYYY-MM' — 사람이 읽는 '2026년 8월'로 바꿔 보낸다
        const [y, m] = dispatch.period.split('-')
        alimtalkSent = await sendMonthlyReportAlimtalk({
          customerPhone: customer.phone,
          customerName:  customer.name ?? '고객',
          businessName:  biz?.name ?? '',
          period:        `${y}년 ${Number(m)}월`,
          visitCount:    dispatch.completed_visits ?? 0,
          reportUrl:     `${appUrl}/q/${businessId}/monthly-report/${dispatch.customer_id}?month=${dispatch.period}`,
        })
      } catch (e) {
        // 발송 실패가 검토 완료 처리를 막지는 않는다 — 사장님이 링크를 직접 보낼 수 있다
        console.error('[MonthlyReport] 알림톡 발송 실패:', e)
      }
    }

    const { error } = await looseDb
      .from('monthly_report_dispatches')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 처리에 실패했어요')

    revalidatePath('/dashboard/monthly-reports')
    revalidatePath('/dashboard')
    return { success: true, alimtalkSent }
  })

// 이번 달 리포트 발송 건너뛰기
export const skipMonthlyReportAction = action
  .schema(z.object({ dispatchId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const looseDb = db as unknown as SupabaseClient

    const { error } = await looseDb
      .from('monthly_report_dispatches')
      .update({ status: 'skipped', sent_at: new Date().toISOString() })
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
      .eq('status', 'pending')

    if (error) throw new Error('[APP] 처리에 실패했어요')

    revalidatePath('/dashboard/monthly-reports')
    revalidatePath('/dashboard')
    return { success: true }
  })
