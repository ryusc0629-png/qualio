'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendMonthlyReportAlimtalk } from '@/lib/kakao/alimtalk'
import { buildMonthlyCharge, type ChargeContract } from '@/lib/reports/monthly-charge'
import { loadOneOffJobs } from '@/lib/reports/one-off-jobs'
import { toMarketYmd } from '@/lib/format/datetime'

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

// 이번 달 청구 금액을 사장님이 직접 정한다.
//
// 왜 필요한가: 계약이 달 중간에 시작·종료하면 그 달은 한 달 치가 아니다.
// 우리는 일수로 나눈 값을 기본으로 보여주지만, 일할 방식은 업체마다 다르다
// (방문 횟수로 나누거나, 첫 달은 아예 안 받거나, 만원 단위로 맞추거나).
// null을 보내면 다시 자동 계산값으로 돌아간다.
export const setMonthlyReportChargeAction = action
  .schema(
    z.object({
      dispatchId: z.string().uuid(),
      // 0원도 뜻이 있다 — '이 달은 청구 안 함'
      amount: z.number().int().min(0).max(2_000_000_000).nullable(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    const looseDb = db as unknown as SupabaseClient

    const { error } = await looseDb
      .from('monthly_report_dispatches')
      .update({ charge_amount: parsedInput.amount })
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)

    if (error) {
      console.error('[MonthlyReport] 청구 금액 저장 실패:', error)
      throw new Error('[APP] 금액을 저장하지 못했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/monthly-reports')
    return { success: true }
  })

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
      .select('status, period, completed_visits, charge_amount, customer_id, customers!customer_id(name, phone), businesses!business_id(name)')
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as {
        data: {
          status: string
          period: string
          completed_visits: number | null
          charge_amount: number | null
          customer_id: string
          customers: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
          businesses: { name: string } | { name: string }[] | null
        } | null
      }

    if (!dispatch) throw new Error('[APP] 리포트를 찾을 수 없습니다')
    if (dispatch.status !== 'pending') throw new Error('[APP] 이미 처리된 리포트예요')

    // 거래처에 알림톡 발송
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
        console.error('[MonthlyReport] 알림톡 발송 실패:', e)
      }
    }

    // ⚠️ 실제로 못 나갔으면 '보냄'으로 잠그지 않는다.
    //    예전엔 실패해도 status를 sent로 바꿨는데, 목록은 pending만 다루므로
    //    한 번 잠기면 다시 보낼 수가 없었다. 거래처는 아무것도 못 받았는데
    //    사장님 화면에는 '보냄'으로 남는 상태가 된다.
    //    (템플릿 심사 중이라 발송이 반드시 실패하는 기간에 특히 위험하다 — 2026-08-19)
    //    연락처가 없는 거래처는 애초에 카톡으로 보낼 수 없으니 '보냄 처리'를 허용한다.
    const hasPhone = !!customer?.phone
    if (hasPhone && !alimtalkSent) {
      throw new Error('[APP] 지금은 카톡으로 보낼 수 없어요. 잠시 후 다시 눌러주세요')
    }

    // ★보낸 순간의 청구 금액을 박아둔다.
    // 안 박아두면 나중에 계약 금액을 고치거나 우리가 계산 규칙을 손볼 때,
    // 이미 보낸 보고서를 거래처가 다시 열면 숫자가 달라진다(= 받은 청구서가 바뀐다).
    let frozenCharge = dispatch.charge_amount
    if (frozenCharge == null) {
      const { data: contractRows } = (await looseDb
        .from('contracts')
        .select('id, service_type, frequency, contract_price, status, start_date, end_date, price_history')
        .eq('business_id', businessId)
        .eq('customer_id', dispatch.customer_id)) as unknown as { data: ChargeContract[] | null }

      const oneOff = await loadOneOffJobs(looseDb, businessId, [dispatch.customer_id], dispatch.period)

      frozenCharge =
        buildMonthlyCharge({
          contracts: contractRows ?? [],
          billingMonth: dispatch.period,
          customerId: dispatch.customer_id,
          issuedYmd: toMarketYmd(),
          oneOffJobs: oneOff.get(dispatch.customer_id) ?? [],
        })?.total ?? null
    }

    const { error } = await looseDb
      .from('monthly_report_dispatches')
      .update({ status: 'sent', sent_at: new Date().toISOString(), charge_amount: frozenCharge })
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

// 현장 요청 '처리했어요' 표시 — 사장님이 월간 리포트를 보내기 전 검토 화면에서 누른다.
//
// 왜 여기서 누르나: 요청을 적는 사람(현장 직원)에게 체크를 하나 더 시키면 안 적게 되고,
// 그러면 요청 자체가 사라진다(현장 앱은 입력을 늘리지 않는 것이 원칙). 사장님은 어차피
// 보내기 전에 이 화면에서 내용을 읽으므로, 그 자리에서 한 번 누르는 게 가장 싸다.
export const markCustomerRequestDoneAction = action
  .schema(z.object({ bookingId: z.string().uuid(), done: z.boolean() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()

    const { error } = await db
      .from('bookings')
      .update({
        customer_request_done_at: parsedInput.done ? new Date().toISOString() : null,
      } as never)
      .eq('id', parsedInput.bookingId)
      .eq('business_id', businessId)

    if (error) {
      console.error('[MonthlyReport] 현장 요청 처리 표시 실패:', error)
      throw new Error('[APP] 처리에 실패했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/monthly-reports')
    return { success: true }
  })
