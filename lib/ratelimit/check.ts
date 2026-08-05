import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// 공개(로그인 불필요) 엔드포인트 비용 남용 방지용 레이트리밋 래퍼.
// check_rate_limit RPC(단일 행 원자적 카운터)를 호출해 허용이면 true, 한도 초과면 false.
// DB/RPC 오류 시에는 정상 사용자를 막지 않도록 허용(true)으로 폴백한다.
export async function checkRateLimit(
  db: SupabaseClient,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  try {
    const { data, error } = await db.rpc('check_rate_limit' as never, {
      p_key: key,
      p_limit: limit,
      p_window_sec: windowSec,
    } as never)
    if (error) {
      console.error('[RateLimit] RPC 오류:', error)
      return true
    }
    return data === true
  } catch (e) {
    console.error('[RateLimit] 예외:', e)
    return true
  }
}
