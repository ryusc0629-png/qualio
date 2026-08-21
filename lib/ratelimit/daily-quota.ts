import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toMarketYmd } from '@/lib/format/datetime'
import { checkRateLimit } from './check'
import { QUOTAS, type QuotaKey } from './quotas'

// 업체별 "하루 몇 번까지" 한도.
//
// 왜 이렇게 쓰는가:
//   ①원가 보호 — 글 만들기 버튼은 누를 때마다 모델을 호출한다. 초안이 마음에 안 들어
//     수십 번 재생성하면 한 업체가 하루에 만원 단위를 태울 수 있다.
//   ②검색 노출 보호 — 하루에 글을 몰아서 여러 편 올리면 검색엔진이 '양산'으로 보고
//     오히려 홈페이지 평가를 깎는다. 한도는 사장님 손해를 막는 장치이기도 하다.
//
// 키에 한국 날짜를 넣어 한국 자정에 자연스럽게 초기화되게 한다. 윈도우를 36시간으로 두는 건
// 카운터 행이 그날 안에 만료돼 한도가 도중에 풀리는 일을 막기 위한 여유분이다.
// (Vercel은 UTC로 도니 날짜 계산은 반드시 toMarketYmd를 거칠 것)
const WINDOW_SEC = 36 * 60 * 60

// 글 만들기 한도는 quotas.ts에 있다(테스트에서도 읽어야 해서 server-only 밖으로 뺐다).
export { POST_DRAFT_SCOPE, POST_DRAFT_DAILY_LIMIT } from './quotas'

type Db = SupabaseClient

function dailyKey(scope: string, businessId: string): string {
  return `${scope}:${businessId}:${toMarketYmd()}`
}

/**
 * 한도가 남아 있으면 1회 차감하고 true. 다 썼으면 false.
 * 카운터 증가는 DB에서 원자적으로 처리되므로 버튼 연타에도 어긋나지 않는다.
 */
export async function consumeDailyQuota(
  db: Db,
  scope: string,
  businessId: string,
  limit: number,
): Promise<boolean> {
  return checkRateLimit(db, dailyKey(scope, businessId), limit, WINDOW_SEC)
}

/**
 * 오늘 이미 쓴 횟수 (표시 전용 — 카운터를 올리지 않는다).
 * 한도를 넘겨 눌린 시도까지 세어질 수 있으므로 화면에는 limit로 잘라서 보여줄 것.
 */
export async function getDailyUsage(
  db: Db,
  scope: string,
  businessId: string,
): Promise<number> {
  const { data } = await db
    .from('rate_limits' as never)
    .select('count, reset_at' as never)
    .eq('key' as never, dailyKey(scope, businessId))
    .maybeSingle() as unknown as { data: { count: number; reset_at: string } | null }

  if (!data) return 0
  // 윈도우가 이미 지난 행은 다음 호출 때 1로 리셋되므로 0으로 본다
  if (new Date(data.reset_at).getTime() < Date.now()) return 0
  return data.count
}

// ── 나머지 자동 작성 기능들의 하루 한도 ──────────────────────
// 숫자와 근거는 ./quotas.ts 에 있다(테스트에서도 읽어야 해서 server-only 밖으로 뺐다).

export { QUOTAS, type QuotaKey } from './quotas'

/**
 * 한도를 1회 차감한다. 다 썼으면 사장님이 이해할 수 있는 문구로 막는다.
 */
export async function spendQuota(
  db: Db,
  key: QuotaKey,
  businessId: string,
): Promise<void> {
  const { scope, limit, label } = QUOTAS[key]
  const allowed = await consumeDailyQuota(db, scope, businessId, limit)
  if (!allowed) {
    throw new Error(
      `[APP] 오늘은 ${label}를 ${limit}번까지 할 수 있어요. 내일 다시 하실 수 있습니다`,
    )
  }
}
