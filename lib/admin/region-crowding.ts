import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

// 같은 지역 고객사가 퀄리오 도메인 하나에 몰리는지 감시한다.
//
// 왜 필요한가: 검색엔진은 한 검색어에 한 도메인 결과를 1~2개만 노출한다.
// 같은 시군구 업체가 퀄리오 주소(qualio.co.kr/biz/*)에 3곳 이상 쌓이면
// 그때부터는 뒤쪽 업체가 페이지를 만들어도 노출이 0이 된다. 요금은 다 받는데 결과가 없는 상태다.
// 자체 도메인을 붙인 곳은 이미 빠져나간 것이라 세지 않는다.
//
// 이 숫자를 사람 기억에 맡기면 놓친다. /admin 첫 화면에 띄워 스스로 알리게 한다.

export interface RegionCrowding {
  region: string
  count: number
  names: string[]
}

interface Row {
  name: string | null
  address: string | null
  seo_generated_at: string | null
  custom_domain: string | null
  custom_domain_status: string | null
}

/** '울산광역시 울주군 삼남읍 …' → '울산광역시 울주군' (시군구까지) */
function toRegionKey(address: string | null): string | null {
  if (!address) return null
  const parts = address.trim().split(/\s+/)
  if (parts.length < 2) return null
  return `${parts[0]} ${parts[1]}`
}

/**
 * 겹치는 지역 목록(2곳 이상)을 많은 순으로 돌려준다.
 * 홍보 페이지를 실제로 만든 업체만 센다 — 안 만든 곳은 검색에 나가지도 않아 경쟁이 성립하지 않는다.
 */
export async function getRegionCrowding(): Promise<RegionCrowding[]> {
  const looseDb = createServiceClient() as unknown as SupabaseClient
  const { data } = (await looseDb
    .from('businesses')
    .select('name, address, seo_generated_at, custom_domain, custom_domain_status')
    .not('slug', 'is', null)) as unknown as { data: Row[] | null }

  const buckets = new Map<string, string[]>()

  for (const b of data ?? []) {
    if (!b.seo_generated_at) continue
    // 자체 도메인이 살아 있으면 퀄리오 도메인 경쟁에서 빠진 것
    if (b.custom_domain && b.custom_domain_status === 'active') continue

    const region = toRegionKey(b.address)
    if (!region) continue

    const list = buckets.get(region) ?? []
    list.push(b.name ?? '(이름 없음)')
    buckets.set(region, list)
  }

  return [...buckets.entries()]
    .filter(([, names]) => names.length >= 2)
    .map(([region, names]) => ({ region, count: names.length, names: names.sort() }))
    .sort((a, b) => b.count - a.count)
}
