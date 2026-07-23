'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runGeoCheck } from '@/lib/geo/run-check'
import { revalidatePath } from 'next/cache'

// "지금 측정하기" 버튼 — 사장님이 즉시 AI 검색 노출률을 측정한다.
export const runGeoCheckAction = action
  .schema(z.object({}))
  .action(async () => {
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

    // 비용 안전장치 — 최근 12시간 내 측정이 있으면 유료 호출 없이 막는다.
    // (평소 측정은 매주 자동 cron이 담당. 수동은 첫 측정·간헐 확인용)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const { data: recent } = (await db
      .from('geo_checks' as never)
      .select('id' as never)
      .eq('business_id' as never, profile.business_id)
      .gte('checked_at' as never, twelveHoursAgo)
      .limit(1)) as unknown as { data: { id: string }[] | null }
    if (recent && recent.length > 0) {
      throw new Error('[APP] 방금 측정했어요. 노출률은 천천히 바뀌니 매주 자동 측정 결과를 기다려 주세요')
    }

    const { skipped, result } = await runGeoCheck(db, profile.business_id)

    if (skipped === 'no-key') {
      // 측정 엔진 키 미설정 — 사용자에겐 기술용어 없이 "준비 중"으로 안내
      throw new Error('[APP] 노출률 측정이 아직 준비 중이에요. 조금만 기다려 주세요')
    }
    if (skipped === 'no-questions') {
      throw new Error('[APP] 먼저 업체 지역(주소)과 서비스를 등록해 주세요. 측정에 꼭 필요해요')
    }

    revalidatePath('/dashboard/marketing')
    return { success: true, sharePct: result?.sharePct ?? 0, cited: result?.cited ?? 0, total: result?.total ?? 0 }
  })
