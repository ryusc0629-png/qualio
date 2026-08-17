import type { createServiceClient } from '@/lib/supabase/server'

/**
 * 홍보 페이지 문구(제목·소개글·검색 키워드)가 낡았다고 표시한다.
 *
 * 이 문구들은 '홍보 페이지 만들기'를 누른 그 순간의 스냅샷이라, 서비스나 주력 고객을
 * 바꿔도 저절로 따라오지 않는다. 실제로 다트클린은 정기청소를 등록하기 이틀 전에 찍힌
 * "입주청소·에어컨청소" 제목이 한 달 내내 검색에 그대로 노출됐다.
 * 그래서 재료가 바뀔 때마다 이 시각을 남겨 두고, 대시보드에서 다시 만들라고 알린다.
 */
export async function markSeoStale(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
) {
  const { error } = await db
    .from('businesses')
    .update({ seo_stale_at: new Date().toISOString() } as never)
    .eq('id', businessId)

  // 표시에 실패해도 원래 작업(서비스 저장 등)은 성공시킨다 — 알림이 안 뜰 뿐이다
  if (error) console.error('[SEO] 낡음 표시 실패:', error)
}
