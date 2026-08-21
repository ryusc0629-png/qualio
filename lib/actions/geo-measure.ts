'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runGeoCheck } from '@/lib/geo/run-check'
import { isAdminEmail } from '@/lib/admin/auth'
import { revalidatePath } from 'next/cache'

// "지금 측정하기" — 본사(퀄리오) 계정 전용.
//
// ⛔고객사에는 노출하지 않는다. 한 번 누를 때마다 90번의 외부 호출(1,609원)이 나가서,
//   궁금해서 몇 번 눌러보는 것만으로 그 달 원가가 몇 배가 된다.
//   고객사는 **월 1회 크론 측정만** 쓴다(app/api/cron/geo-measure).
//   본사에만 두는 건 문구·엔진 구성을 바꿔가며 우리가 직접 확인해야 하기 때문이다.
//
// ⚠️화면에서 버튼을 숨기는 것만으로는 부족하다 — 액션 주소를 알면 그냥 부를 수 있다.
//   여기서 막는 게 진짜 방어선이다.
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

    // 본사 계정만 — 고객사는 크론이 월 1회 재준다
    if (!isAdminEmail(user.email)) {
      throw new Error('[APP] 노출률은 매달 한 번 자동으로 측정돼요')
    }

    // 글이 한 편도 없으면 재봐야 0%다 — AI 검색은 '읽을 글'이 있어야 인용한다.
    // 측정 1회가 90번의 외부 호출이라, 결과가 뻔한 데 쓰면 돈만 나가고
    // 화면엔 0%만 남아 사장님이 이 기능을 안 믿게 된다.
    //
    // ⚠️글은 사장님이 쓰는 게 아니라 매일 자동으로 발행된다.
    //   그래서 0편이라는 건 '안 썼다'가 아니라 **자동 글쓰기가 꺼져 있다**는 뜻이다.
    //   ⛔"글을 써주세요"라고 안내하지 말 것 — 우리 제품이 하는 일을 사장님에게 미루는 말이다.
    const [{ count: publishedCount }, { data: biz }] = await Promise.all([
      db
        .from('biz_posts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', profile.business_id)
        .eq('published', true),
      db
        .from('businesses')
        .select('monthly_post_target' as never)
        .eq('id', profile.business_id)
        .maybeSingle() as unknown as Promise<{ data: { monthly_post_target: number | null } | null }>,
    ])

    if ((publishedCount ?? 0) === 0) {
      throw new Error(
        (biz?.monthly_post_target ?? 0) === 0
          ? '[APP] 자동 글쓰기를 먼저 켜주세요. 글이 쌓여야 AI 검색에 잡혀요'
          : '[APP] 첫 글이 올라가면 바로 잴 수 있어요. 자동 글쓰기가 켜져 있으니 조금만 기다려주세요',
      )
    }

    // 비용 안전장치 — 같은 질문으로 반복해 재는 것만 막는다.
    // 질문 세트가 바뀌었으면(검색어 규칙 개선·지역/서비스 추가) 바로 다시 잴 수 있어야 한다.
    //
    // 본사(관리자) 계정은 잠금을 두지 않는다. 다트클린은 우리가 직접 운영하는 계정이라
    // 검색어·문구를 바꿔가며 그때그때 확인해야 하는데, 잠금이 걸리면 매번 기다려야 한다.
    // 본사 계정만 여기까지 오므로 잠금은 두지 않는다 —
    // 검색어·문구를 바꿔가며 그때그때 확인해야 한다
    const { skipped, result } = await runGeoCheck(db, profile.business_id, {
      minIntervalHours: 0,
    })

    if (skipped === 'too-soon') {
      throw new Error('[APP] 방금 측정했어요. 잠시 후에 다시 눌러주세요')
    }


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
