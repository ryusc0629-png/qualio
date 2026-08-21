import type { SupabaseClient } from '@supabase/supabase-js'

// 자동 발행 중복 방지 락 (업체 단위).
//
// 왜 '오늘 몇 편 올렸나'를 세는 것만으로 부족한가:
//   글 한 편을 만드는 데 40초~5분이 걸린다. 그 사이에 다른 실행이 시작되면
//   둘 다 "오늘 0편"을 읽고 각자 발행한다(읽고→쓰기 사이의 틈).
//   실제로 2026-08-08·14·18·20·21에 같은 제목이 두 번씩 올라갔다.
//   드라이버가 둘(pg_cron 15분 간격 재시도 + Vercel cron)이라 겹칠 일이 계속 생긴다.
//
// 그래서 세는 대신 '자리를 맡는다'. update ... where (락 없음 or 만료)는 한 문장이라
// 두 실행이 동시에 들어와도 한쪽만 성공한다(원자적).
//
// ⚠️만료는 라우트 제한시간(maxDuration 300초)보다 길어야 한다.
//   만료가 더 짧으면 아직 글을 쓰고 있는 중에 다른 실행이 락을 뺏어 같은 사고가 난다.
const LOCK_MINUTES = 6

/** 자리 맡기 성공 시 true. 이미 다른 실행이 쓰고 있으면 false */
export async function acquireAutoPostLock(db: SupabaseClient, businessId: string): Promise<boolean> {
  const nowIso = new Date().toISOString()
  const lockUntilIso = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()

  const { data } = await db
    .from('businesses')
    .update({ auto_post_lock_until: lockUntilIso } as never)
    .eq('id', businessId)
    .or(`auto_post_lock_until.is.null,auto_post_lock_until.lt.${nowIso}`)
    .select('id')
    .maybeSingle()

  return !!data
}

/** 발행이 끝나면(실패했더라도) 반드시 풀어준다 — 안 풀면 다음 실행이 6분간 막힌다 */
export async function releaseAutoPostLock(db: SupabaseClient, businessId: string): Promise<void> {
  await db
    .from('businesses')
    .update({ auto_post_lock_until: null } as never)
    .eq('id', businessId)
}
