'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

// 리포트 발송 처리(검토 완료)
// 알림톡 심사 중이라 지금은 '검토 완료(sent)'로 표시만 한다. 사장님이 확보한 링크를 카톡으로 전달.
// → 알림톡 템플릿 승인 후, 이 자리에서 sendAlimtalk(...)로 자동 발송으로 승격하면 된다.
export const sendMonthlyReportAction = action
  .schema(z.object({ dispatchId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getBusinessId()
    // monthly_report_dispatches는 아직 database.ts 타입에 없어 느슨한 클라이언트로 접근
    const looseDb = db as unknown as SupabaseClient

    const { data: dispatch } = await looseDb
      .from('monthly_report_dispatches')
      .select('status')
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)
      .maybeSingle() as unknown as { data: { status: string } | null }

    if (!dispatch) throw new Error('[APP] 리포트를 찾을 수 없습니다')
    if (dispatch.status !== 'pending') throw new Error('[APP] 이미 처리된 리포트예요')

    const { error } = await looseDb
      .from('monthly_report_dispatches')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', parsedInput.dispatchId)
      .eq('business_id', businessId)

    if (error) throw new Error('[APP] 처리에 실패했어요')

    revalidatePath('/dashboard/monthly-reports')
    revalidatePath('/dashboard')
    return { success: true }
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
