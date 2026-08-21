import type { SupabaseClient } from '@supabase/supabase-js'

// 같은 지역 다른 고객사가 이미 쓴 제목을 피하기 위한 조회.
//
// 왜 필요한가: 우리 고객사는 업종이 같고(청소), 지역도 겹친다. 주제를 뽑는 방식도 같으니
// 업체가 늘수록 "울산 에어컨 청소, 언제 맡겨야 할까?" 같은 제목이 여러 업체에서 겹친다.
// 겹치면 손해가 우리 고객끼리 난다 — 검색엔진이 같은 지역·같은 제목을 서로 대체재로 보고
// 양쪽 순위를 함께 깎기 때문이다(카니발라이제이션).
//
// 주제가 겹치는 것 자체는 막을 수 없다(여름엔 다들 에어컨을 판다).
// 막아야 하는 건 '제목이 글자 그대로 같은 것'이다.

// 주소에서 지역 키를 뽑는다 — '울산광역시 남구 …' → ['울산', '남구']
// 시/도만 맞아도 같은 검색 시장으로 본다(청소는 시 단위로 검색된다).
export function regionKeysOf(address: string | null | undefined): string[] {
  if (!address) return []
  const cleaned = address.replace(/\s+/g, ' ').trim()
  const keys: string[] = []

  // 시/도 — '서울특별시'·'울산광역시'·'경기도' 등에서 접미사를 떼고 앞 2글자를 쓴다
  const sido = cleaned.match(/^([가-힣]+?)(특별시|광역시|특별자치시|특별자치도|도)\b/)
  if (sido) keys.push(sido[1].slice(0, 2))

  // 시군구 — '남구'·'울주군'·'성남시'
  const sigungu = cleaned.match(/\s([가-힣]+[시군구])\b/)
  if (sigungu) keys.push(sigungu[1])

  return keys
}

/**
 * 같은 지역의 '다른' 고객사가 최근 쓴 글 제목.
 * 제목 생성·주제 추천에 회피 목록으로 넘긴다.
 */
export async function fetchNeighborTitles(
  db: SupabaseClient,
  businessId: string,
  opts: { address: string | null; days?: number; limit?: number } = { address: null },
): Promise<string[]> {
  const keys = regionKeysOf(opts.address)
  if (keys.length === 0) return []

  const since = new Date(Date.now() - (opts.days ?? 120) * 24 * 60 * 60 * 1000).toISOString()

  // 같은 지역 업체 id — 주소에 지역 키가 들어간 업체(자기 자신 제외)
  const { data: neighbors } = await db
    .from('businesses')
    .select('id, address')
    .neq('id', businessId)
    .limit(500)

  const neighborIds = (neighbors ?? [])
    .filter((b) => {
      const bKeys = regionKeysOf((b as { address: string | null }).address)
      return bKeys.some((k) => keys.includes(k))
    })
    .map((b) => (b as { id: string }).id)

  if (neighborIds.length === 0) return []

  const { data: posts } = await db
    .from('biz_posts')
    .select('title')
    .in('business_id', neighborIds)
    .eq('post_type', 'geo')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(opts.limit ?? 60)

  return [...new Set((posts ?? []).map((p) => (p as { title: string }).title).filter(Boolean))]
}

// 제목 비교용 정규화 — 공백·문장부호·조사 차이는 사람 눈에 '같은 제목'이다
function normalizeTitle(t: string): string {
  return t.replace(/[\s·,.!?~\-–—'"“”‘’()[\]]/g, '').toLowerCase()
}

/** 이 제목이 이웃 업체 제목과 글자 그대로 같은지 */
export function isTitleTaken(title: string, neighborTitles: string[]): boolean {
  const n = normalizeTitle(title)
  return neighborTitles.some((t) => normalizeTitle(t) === n)
}
