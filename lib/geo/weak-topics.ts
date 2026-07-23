import 'server-only'
import type { createServiceClient } from '@/lib/supabase/server'

// GEO 측정에서 '안 잡히는 질문(약점)'을 자동 발행의 다음 주제로 공급한다.
// → 사장님이 손대지 않아도, 같은 월 발행량이 노출률 약점을 우선 공략하도록 연결.

type Db = ReturnType<typeof createServiceClient>

interface GeoCheckDetail {
  query: string
  mentioned: boolean
}

// 질문을 실제 검색 키워드로 정리 — 끝의 구매의도 말꼬리를 떼어 본문·태그 최적화에 씀.
// 예: "울산 청소업체 추천" → "울산 청소", "울산 정기청소 잘하는 곳" → "울산 정기청소"
export function deriveKeyword(question: string): string {
  return question
    .replace(/(업체\s*)?(추천(해줘)?|잘하는\s*곳|어디가?\s*좋아\??|전문\s*업체|비용|가격)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 최신 측정에서 '안 잡히는 질문' 중 이번 달 아직 안 다룬 것을 하나 골라 발행 주제로 반환.
// 없으면 null(→ 호출부는 일반 주제 추천으로 폴백).
export async function pickWeakGeoTopic(
  db: Db,
  businessId: string,
  publishedTitles: string[],
): Promise<{ topic: string; keyword: string } | null> {
  const { data } = (await db
    .from('geo_checks' as never)
    .select('detail' as never)
    .eq('business_id' as never, businessId)
    .order('checked_at' as never, { ascending: false })
    .limit(1)) as unknown as { data: { detail: GeoCheckDetail[] }[] | null }

  const detail = data?.[0]?.detail ?? []
  const weak = detail.filter((d) => !d.mentioned).map((d) => d.query)

  for (const q of weak) {
    const keyword = deriveKeyword(q)
    if (!keyword) continue
    // 이번 달 발행 제목에 이 키워드가 이미 있으면 건너뜀(같은 주제 중복 방지 → 약점 질문을 고루 공략)
    const covered = publishedTitles.some((t) => t.includes(keyword))
    if (!covered) return { topic: q, keyword }
  }
  return null
}
