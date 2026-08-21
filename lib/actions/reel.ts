'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderReelForReport } from '@/lib/reel/render'
import { REEL_QUEUED, REEL_FAILED, REEL_PROCESSING } from '@/lib/reel/queue'
import { revalidatePath } from 'next/cache'

// "지금 만들기" — 대기열에 있는 홍보 영상을 기다리지 않고 바로 만든다.
//
// 왜 대표 화면에만 두나: 홍보는 대표의 일이다. 현장 앱에는 만들기 버튼을 두지 않는다
// (직원이 버튼 누르고 1분 기다리는 건 그냥 일이 하나 느는 것).
// 반대로 대표가 자기 화면에서 "지금 보고 싶다"고 누르는 건 스스로 고른 기다림이라 괜찮다.
//
// 평소엔 크론이 새벽에 만든다. 이 버튼은 '오늘 찍은 걸 오늘 올리고 싶을 때'를 위한 것.

export const makeReelNowAction = action
  .schema(z.object({ reportId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // 남의 업체 보고서를 만들 수 없게 한다
    const { data: report } = (await db
      .from('reports')
      .select('id, reel_status')
      .eq('id', parsedInput.reportId)
      .eq('business_id', profile.business_id)
      .maybeSingle()) as { data: { id: string; reel_status: string | null } | null }

    if (!report) throw new Error('[APP] 보고서를 찾을 수 없어요')

    const status = report.reel_status ?? ''
    if (status === REEL_PROCESSING) throw new Error('[APP] 이미 만들고 있어요. 조금만 기다려주세요')
    if (status !== REEL_QUEUED && status !== REEL_FAILED) {
      throw new Error('[APP] 지금 만들 수 있는 상태가 아니에요')
    }

    const result = await renderReelForReport(db as unknown as SupabaseClient, parsedInput.reportId)
    if (!result.ok) {
      // 재료가 모자란 건 사장님이 고칠 수 있는 문제라 그대로 알려준다
      throw new Error(`[APP] 영상을 못 만들었어요 — ${result.reason}`)
    }

    revalidatePath('/dashboard/marketing')
    return { success: true }
  })
