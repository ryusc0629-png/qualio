import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// 자동 글쓰기를 켜도 되는 상태인가.
//
// 왜 필요한가: 재료 없이 켜면 글이 뻔한 소리가 된다.
//   - 서비스 항목이 없으면 프롬프트에 '청소 서비스'만 들어간다(무슨 청소인지 모른다)
//   - 주소가 없으면 '위치 정보 없음'이 들어가 지역 검색을 아예 못 노린다.
//     "울산 울주군 입주청소"로 잡히는 게 이 기능의 전부인데 그게 빠진다.
//
// 그런 글은 검색에도 안 잡히면서 토큰만 나가고, 사장님은 "글이 올라오는데 왜 손님이 없지"만 남는다.
// 그래서 **켜는 버튼 자체를 재료가 찰 때까지 안 보여준다.**
//
// ⛔조건을 늘리지 말 것 — 여기 있는 건 '없으면 글이 못 쓰이는 것'뿐이다.
//   있으면 좋은 것(홈페이지 사진·자격증 등)까지 넣으면 영영 못 켠다.

export interface ReadinessItem {
  /** 사장님이 알아볼 이름 */
  label: string
  /** 왜 필요한지 — 한 줄 */
  why: string
  /** 채우러 갈 곳 */
  href: string
  done: boolean
}

export interface AutoPostReadiness {
  ready: boolean
  items: ReadinessItem[]
}

export async function checkAutoPostReadiness(
  db: SupabaseClient,
  businessId: string,
): Promise<AutoPostReadiness> {
  const [{ data: biz }, { count: serviceCount }] = await Promise.all([
    db
      .from('businesses')
      .select('address, service_areas')
      .eq('id', businessId)
      .maybeSingle() as unknown as Promise<{
        data: { address: string | null; service_areas: string[] | null } | null
      }>,
    db
      .from('service_items')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null),
  ])

  // 지역은 주소가 원칙이지만, 출장 지역만 채워도 지역 검색어는 만들어진다
  const hasRegion = !!biz?.address?.trim() || (biz?.service_areas?.length ?? 0) > 0

  const items: ReadinessItem[] = [
    {
      label: '서비스 항목',
      why: '무슨 청소를 하는지 알아야 글을 쓸 수 있어요',
      href: '/dashboard/services',
      done: (serviceCount ?? 0) > 0,
    },
    {
      label: '사업장 주소 또는 출장 지역',
      why: '“우리 동네 청소업체”로 검색될 때 잡히려면 지역이 있어야 해요',
      href: '/dashboard/settings',
      done: hasRegion,
    },
  ]

  return { ready: items.every((i) => i.done), items }
}
