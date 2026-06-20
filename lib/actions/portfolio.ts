'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generatePortfolioContent } from '@/lib/ai/portfolio-content'
import { generateAndSaveChannelContent } from '@/lib/ai/channel-content'
import { notifyIndexNowForPosts } from '@/lib/seo/indexnow'
import { revalidatePath } from 'next/cache'

type ServiceDb = ReturnType<typeof createServiceClient>

interface AiReportData {
  beforeStatus: string
  workDetails: string
  afterResult: string
  additionalNotes: string
  recommendedServices: string[]
}

// 포트폴리오 초안 자동 생성 (보고서 저장 시 비동기 호출)
export async function createPortfolioDraft(db: ServiceDb, reportId: string): Promise<string | null> {
  // 보고서 + 예약 + 업체 정보 조회
  const { data: report } = await db
    .from('reports' as never)
    .select('id, business_id, booking_id, ai_report_data, reel_url' as never)
    .eq('id' as never, reportId)
    .single() as unknown as {
      data: {
        id: string
        business_id: string
        booking_id: string
        ai_report_data: AiReportData | null
        reel_url: string | null
      } | null
    }

  if (!report?.ai_report_data) return null

  // 중복 체크 — 이미 이 보고서로 포트폴리오가 생성됐으면 스킵
  const { data: existing } = await db
    .from('biz_posts' as never)
    .select('id' as never)
    .eq('source_report_id' as never, reportId)
    .maybeSingle() as unknown as { data: { id: string } | null }

  if (existing) return existing.id

  // Before/After 사진 조회
  const { data: photos } = await db
    .from('report_photos')
    .select('url, type')
    .eq('report_id', reportId)
    .order('sort_order', { ascending: true })

  const beforeUrls = (photos ?? []).filter((p) => p.type === 'before').map((p) => p.url)
  const afterUrls  = (photos ?? []).filter((p) => p.type === 'after').map((p) => p.url)

  // Before/After 사진 모두 1장 이상 있어야 포트폴리오 가치가 있음
  if (beforeUrls.length === 0 || afterUrls.length === 0) return null

  // 예약 정보 (서비스 타입, 주소, 일시)
  const { data: booking } = await db
    .from('bookings' as never)
    .select('service_address, scheduled_at, quotes!quote_id(cleaning_type)' as never)
    .eq('id' as never, report.booking_id)
    .single() as unknown as {
      data: {
        service_address: string | null
        scheduled_at: string | null
        quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
      } | null
    }

  const quote = Array.isArray(booking?.quotes) ? booking?.quotes[0] : booking?.quotes

  // 업체 정보
  const { data: business } = await db
    .from('businesses')
    .select('name, address')
    .eq('id', report.business_id)
    .single()

  if (!business) return null

  // AI 포트폴리오 콘텐츠 생성
  const portfolioContent = await generatePortfolioContent({
    businessName: business.name,
    address: booking?.service_address ?? business.address,
    cleaningType: (quote?.cleaning_type) ?? '청소 서비스',
    aiReportData: report.ai_report_data,
    scheduledAt: booking?.scheduled_at ?? new Date().toISOString(),
  })

  // slug 중복 방지
  let slug = portfolioContent.slug
  const { data: slugExists } = await db
    .from('biz_posts')
    .select('slug')
    .eq('business_id', report.business_id)
    .eq('slug', slug)
    .maybeSingle()
  if (slugExists) slug = `${slug}-${Date.now().toString(36)}`

  // biz_posts insert (미공개 초안)
  const { data: saved, error } = await db
    .from('biz_posts' as never)
    .insert({
      business_id: report.business_id,
      slug,
      title: portfolioContent.title,
      content: portfolioContent.content,
      summary: portfolioContent.summary,
      image_url: afterUrls[0] ?? null,
      image_urls: [...beforeUrls, ...afterUrls],
      ai_generated: true,
      published: false,
      post_type: 'portfolio',
      source_report_id: reportId,
      before_image_urls: beforeUrls,
      after_image_urls: afterUrls,
      reel_url: report.reel_url ?? null,
    } as never)
    .select('id' as never)
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null }

  if (error) {
    console.error('[Portfolio] biz_posts insert 실패:', error.message)
    return null
  }

  // 채널 콘텐츠 생성 (네이버/당근/인스타)
  if (saved?.id) {
    await generateAndSaveChannelContent(db, saved.id, {
      businessName: business.name,
      address: booking?.service_address ?? business.address,
      geoTitle: portfolioContent.title,
      geoContent: portfolioContent.content,
    }).catch((err) => {
      console.error('[Portfolio] 채널 콘텐츠 생성 실패:', err)
    })
  }

  return saved?.id ?? null
}

// 사장님이 포트폴리오 초안을 공개 승인
export const approvePortfolioAction = action
  .schema(z.object({ postId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('biz_posts' as never)
      .update({
        published: true,
        published_at: new Date().toISOString(),
      } as never)
      .eq('id' as never, parsedInput.postId)
      .eq('business_id' as never, profile.business_id)
      .eq('post_type' as never, 'portfolio')

    if (error) throw new Error('[APP] 승인에 실패했습니다')

    // 발행된 포트폴리오 글을 네이버·빙에 색인 알림 (slug 조회)
    const { data: row } = await db
      .from('biz_posts' as never)
      .select('slug' as never)
      .eq('id' as never, parsedInput.postId)
      .maybeSingle() as unknown as { data: { slug: string } | null }
    if (row?.slug) await notifyIndexNowForPosts(db, profile.business_id, [row.slug])

    revalidatePath('/dashboard/marketing')
    return { success: true }
  })

// 사장님이 포트폴리오 초안을 삭제
export const rejectPortfolioAction = action
  .schema(z.object({ postId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { error } = await db
      .from('biz_posts')
      .delete()
      .eq('id', parsedInput.postId)
      .eq('business_id', profile.business_id)

    if (error) throw new Error('[APP] 삭제에 실패했습니다')

    revalidatePath('/dashboard/marketing')
    return { success: true }
  })
