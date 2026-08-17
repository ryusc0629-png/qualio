import 'server-only'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getReviewSummary } from '@/lib/reviews/get-reviews'
import type { ProposalBusiness, ProposalExtras, ProposalBeforeAfter } from './build'
import type { ProposalSettings } from './content'

export interface ProposalContext {
  business: ProposalBusiness
  settings: ProposalSettings | null
  extras: ProposalExtras
}

// 로그인한 사장님의 업체 + 소개서 설정 + 홈페이지 데이터(사진·후기·서비스)를 함께 로드.
// 인쇄 페이지·에디터 공용. 리치 마케팅 컬럼은 database.ts 타입에 없어 as never / as unknown as 로 읽는다.
export async function loadProposalContext(): Promise<ProposalContext | null> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) return null

  const { data } = (await db
    .from('businesses')
    .select(
      'name, phone, address, slug, logo_url, hero_image_url, brand_color, brand_color_secondary, description, hero_subtitle, strengths, portfolio, owner_photo_url, owner_name, owner_greeting, experience_years, certifications, service_areas, custom_domain, custom_domain_status, proposal_settings' as never,
    )
    .eq('id', profile.business_id)
    .maybeSingle()) as unknown as {
      data: (ProposalBusiness & { proposal_settings: ProposalSettings | null }) | null
    }

  if (!data) return null
  const { proposal_settings, ...business } = data
  const extras = await loadProposalExtras(db, profile.business_id, business)

  return { business, settings: proposal_settings ?? null, extras }
}

// 홈페이지에 이미 쌓인 자산(시공 사례 사진·작업 보고 공개 사진·후기·서비스 항목)을 소개서용으로 모은다.
async function loadProposalExtras(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  business: ProposalBusiness,
): Promise<ProposalExtras> {
  const [reportResult, reviewSummary, serviceResult] = await Promise.all([
    db
      .from('reports')
      .select('id, created_at, report_photos(url, type, sort_order)')
      .eq('business_id', businessId)
      .eq('is_public' as never, true as never)
      .order('created_at', { ascending: false })
      .limit(12),
    getReviewSummary(db, businessId, 4),
    db
      .from('service_items')
      .select('name')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .order('created_at')
      .limit(12),
  ])

  // 시공 사례 — ① 직접 등록한 비포·애프터 ② 홈 공개한 작업 보고의 첫 비포·애프터 (홈페이지와 같은 규칙)
  const manual: ProposalBeforeAfter[] = (business.portfolio ?? [])
    .filter((p) => p.before?.trim() && p.after?.trim())
    .map((p) => ({ before: p.before as string, after: p.after as string }))

  const reportRows =
    (reportResult as unknown as {
      data: { id: string; report_photos: { url: string; type: string; sort_order: number }[] | null }[] | null
    }).data ?? []

  const fromReports: ProposalBeforeAfter[] = reportRows
    .map((r) => {
      const photos = r.report_photos ?? []
      const pick = (type: string) =>
        photos.filter((p) => p.type === type).sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null
      return { before: pick('before'), after: pick('after') }
    })
    .filter((p): p is ProposalBeforeAfter => !!p.before && !!p.after)

  const beforeAfter = [...manual, ...fromReports].slice(0, 6)

  // 사진 고르기 후보 — 시공사례 애프터/비포, 작업 보고 사진 전부, 히어로 이미지
  const pool: string[] = [
    ...beforeAfter.flatMap((p) => [p.after, p.before]),
    ...reportRows.flatMap((r) => (r.report_photos ?? []).map((p) => p.url)),
    business.hero_image_url ?? '',
    business.owner_photo_url ?? '',
  ].filter((url) => !!url && url.trim())

  const photoPool = [...new Set(pool)].slice(0, 24)

  const services = ((serviceResult.data ?? []) as { name: string }[])
    .map((s) => s.name)
    .filter((n) => n && n.trim())

  return {
    beforeAfter,
    photoPool,
    reviews: reviewSummary.items
      .filter((r) => r.comment && r.comment.trim())
      .map((r) => ({ rating: r.rating, comment: r.comment as string, customerName: r.customerName })),
    reviewCount: reviewSummary.count,
    reviewAvg: reviewSummary.avg,
    services,
  }
}
