import { createServiceClient } from '@/lib/supabase/server'
import { generateGeoContent } from '@/lib/ai/geo-content'
import type { Json } from '@/lib/types/database'

/**
 * 한 업체의 홍보 페이지 문구(제목·소개글·검색 키워드·자주 묻는 질문)를 지금 재료로 다시 만든다.
 *
 * 대시보드의 '재생성' 버튼과 밤에 도는 자동 정리(cron)가 같은 함수를 쓴다.
 * 두 곳이 각자 만들면 규칙이 갈라져서, 버튼으로 만든 문구와 자동으로 만든 문구가
 * 서로 달라진다.
 */

export interface RegenerateResult {
  ok: boolean
  /** 못 만든 이유 — 서비스·주소가 없으면 추측성 글이 되므로 만들지 않는다 */
  reason?: 'no-services' | 'no-address' | 'not-found' | 'failed'
  seoTitle?: string
}

export async function regenerateGeoForBusiness(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
): Promise<RegenerateResult> {
  const [bizResult, servicesResult] = await Promise.all([
    db
      .from('businesses')
      .select('id, name, address, description, service_areas, target_customer, seo_keywords, seo_keywords_edited_at' as never)
      .eq('id', businessId)
      .maybeSingle() as unknown as Promise<{ data: {
        id: string; name: string; address: string | null; description: string | null
        service_areas: string[] | null; target_customer: string | null
        seo_keywords: string | null; seo_keywords_edited_at: string | null
      } | null }>,
    db
      .from('service_items')
      .select('name, base_price, unit, category')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null),
  ])

  const business = bizResult.data
  if (!business) return { ok: false, reason: 'not-found' }

  const services = servicesResult.data ?? []
  if (services.length === 0) return { ok: false, reason: 'no-services' }
  if (!business.address?.trim()) return { ok: false, reason: 'no-address' }

  let geoContent
  try {
    geoContent = await generateGeoContent({
      businessName: business.name,
      address: business.address,
      description: business.description,
      services,
      serviceAreas: business.service_areas,
      targetCustomer: business.target_customer,
    })
  } catch (e) {
    console.error('[SEO] 문구 재생성 실패:', businessId, e)
    return { ok: false, reason: 'failed' }
  }

  // 사장님이 검색 키워드를 직접 고친 적이 있으면 그건 그대로 둔다.
  // 손으로 정리한 값을 자동 생성이 덮으면, 고쳐도 다음 날 되돌아가는 것처럼 보인다.
  const keepKeywords = !!business.seo_keywords_edited_at && !!business.seo_keywords

  const { error } = await db
    .from('businesses')
    .update({
      seo_title:        geoContent.seoTitle,
      seo_description:  geoContent.seoDescription,
      seo_keywords:     keepKeywords ? business.seo_keywords : geoContent.seoKeywords,
      seo_faqs:         geoContent.faqs as unknown as Json,
      seo_generated_at: new Date().toISOString(),
      seo_stale_at:     null,
    } as never)
    .eq('id', businessId)

  if (error) {
    console.error('[SEO] 문구 저장 실패:', businessId, error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true, seoTitle: geoContent.seoTitle }
}
