import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

// 자체 도메인을 아직 안 붙인 업체 연락 명단.
//
// 왜 필요한가: 퀄리오 주소를 함께 쓰는 한, 같은 지역 업체끼리 한 도메인 안에서 서로를 밀어낸다.
// 자체 도메인은 그 업체에도(검색 점수가 자기 이름으로 쌓임) 퀄리오에도(고객사끼리 경쟁 소멸) 이득이라
// 기다리지 말고 먼저 연락한다. 다만 같은 사장님께 반복해서 전화하면 역효과라
// 마지막 연락 시각(domain_pitch_at)을 남겨 60일 안에 연락한 곳은 뒤로 내린다.

export interface DomainOutreachTarget {
  businessId: string
  name: string
  phone: string | null
  region: string | null
  /** 같은 시군구에서 퀄리오 주소를 함께 쓰는 업체 수(자기 포함) */
  regionPeers: number
  hasPage: boolean
  pitchedAt: string | null
  daysSincePitch: number | null
  /** 지금 연락할 곳인지 — 한 번도 안 했거나 마지막 연락이 60일 넘음 */
  dueNow: boolean
  /** 왜 지금 이 업체인지 한 줄 */
  reason: string
}

interface Row {
  id: string
  name: string | null
  phone: string | null
  address: string | null
  seo_generated_at: string | null
  custom_domain: string | null
  custom_domain_status: string | null
  domain_pitch_at: string | null
}

/** 다시 연락해도 되는 간격(일) */
const RECONTACT_DAYS = 60

/** '울산광역시 울주군 삼남읍 …' → '울산광역시 울주군' */
function toRegionKey(address: string | null): string | null {
  if (!address) return null
  const parts = address.trim().split(/\s+/)
  if (parts.length < 2) return null
  return `${parts[0]} ${parts[1]}`
}

export async function getDomainOutreachTargets(): Promise<DomainOutreachTarget[]> {
  const looseDb = createServiceClient() as unknown as SupabaseClient
  const { data } = (await looseDb
    .from('businesses')
    .select('id, name, phone, address, seo_generated_at, custom_domain, custom_domain_status, domain_pitch_at')
    .not('slug', 'is', null)) as unknown as { data: Row[] | null }

  const rows = data ?? []

  // 퀄리오 주소를 아직 쓰는 업체만 지역별로 센다(자체 도메인이 붙은 곳은 이미 빠져나감)
  const onShared = rows.filter((b) => !(b.custom_domain && b.custom_domain_status === 'active'))
  const regionCount = new Map<string, number>()
  for (const b of onShared) {
    const region = toRegionKey(b.address)
    if (!region) continue
    regionCount.set(region, (regionCount.get(region) ?? 0) + 1)
  }

  const now = Date.now()

  const targets = onShared.map((b) => {
    const region = toRegionKey(b.address)
    const regionPeers = region ? (regionCount.get(region) ?? 1) : 1
    const hasPage = !!b.seo_generated_at

    const daysSincePitch = b.domain_pitch_at
      ? Math.floor((now - new Date(b.domain_pitch_at).getTime()) / 86_400_000)
      : null
    const dueNow = daysSincePitch === null || daysSincePitch >= RECONTACT_DAYS

    // 급한 순서대로 이유를 정한다 — 전화하기 전에 무슨 말을 할지 바로 보이게
    const reason =
      regionPeers >= 3
        ? `같은 지역에 ${regionPeers}곳이 몰려 있어요. 지금 이 업체는 검색에 밀립니다`
        : regionPeers === 2
          ? '같은 지역에 한 곳이 더 있어요. 한 곳 더 들어오면 밀리기 시작해요'
          : hasPage
            ? '홈페이지를 만들어 뒀어요. 지금 옮겨야 검색 점수가 자기 이름으로 쌓여요'
            : '아직 홍보 페이지를 안 만들었어요. 그것부터 안내할 것'

    return {
      businessId: b.id,
      name: b.name ?? '(이름 없음)',
      phone: b.phone,
      region,
      regionPeers,
      hasPage,
      pitchedAt: b.domain_pitch_at,
      daysSincePitch,
      dueNow,
      reason,
    }
  })

  // 겹침 많은 곳 → 홈페이지 만든 곳 → 아직 연락 안 한 곳 순
  return targets.sort((a, b) => {
    if (a.dueNow !== b.dueNow) return a.dueNow ? -1 : 1
    if (a.regionPeers !== b.regionPeers) return b.regionPeers - a.regionPeers
    if (a.hasPage !== b.hasPage) return a.hasPage ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
