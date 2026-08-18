'use server'

import { randomBytes } from 'crypto'
import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendWorkCompleteAlimtalk, sendReviewRequestAlimtalk } from '@/lib/kakao/alimtalk'
import { generateAiReport } from '@/lib/ai/report-writer'
import { createPortfolioDraft } from '@/lib/actions/portfolio'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertReportSendable } from '@/lib/utils/report-send-guard'
import { ensureOnboardingDraft } from '@/lib/onboarding/draft-from-field'
import { revalidatePath } from 'next/cache'

const aiReportDataSchema = z.object({
  beforeStatus:        z.string(),
  workDetails:         z.string(),
  afterResult:         z.string(),
  additionalNotes:     z.string(),
  recommendedServices: z.array(z.string()),
})

const saveReportSchema = z.object({
  bookingId:       z.string().uuid(),
  notes:           z.string().max(5000).optional(),
  preventiveNote:  z.string().max(2000).optional(), // 미리 챙긴 것·지켜볼 것(예방 케어)
  beforePhotoUrls: z.array(z.string().min(1)).max(5),
  afterPhotoUrls:  z.array(z.string().min(1)).max(5),
  sendAlimtalk:    z.boolean(),
  isPublic:        z.boolean().optional(), // 홈페이지 시공 사례 갤러리 공개 여부
  aiReportData:    aiReportDataSchema.optional(),
})

export const saveReportAction = action
  .schema(saveReportSchema)
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

    const { bookingId, notes, preventiveNote, beforePhotoUrls, afterPhotoUrls, sendAlimtalk, isPublic, aiReportData } = parsedInput

    // 예약이 이 업체 소속인지 확인
    const { data: booking } = await db
      .from('bookings')
      .select('id, status, contract_id, customer_name, customer_phone, scheduled_at, service_address, quotes!quote_id(cleaning_type), businesses!business_id(name, phone)' as never)
      .eq('id', bookingId)
      .eq('business_id', profile.business_id)
      .single() as unknown as {
        data: {
          id: string
          status: string
          contract_id: string | null
          customer_name: string | null
          customer_phone: string | null
          scheduled_at: string | null
          service_address: string | null
          quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null
          businesses: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null
        } | null
      }

    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

    // 정기계약 방문이면 보고서는 저장하되 고객 알림톡은 보내지 않는다.
    // 정기 거래처에 나가는 카톡은 방문 전날 안내·초도 보고서·월간 보고서 세 가지뿐이다.
    // (화면에서 버튼을 감췄어도 예전 화면이나 링크로 들어올 수 있어 여기서도 막는다)
    const sendAlimtalkToCustomer = sendAlimtalk && !booking.contract_id

    // 아직 시작도 안 한 일정에는 보고서를 보내지 않는다. 저장 전에 막아야
    // '저장은 됐는데 발송만 실패'한 어정쩡한 상태가 남지 않는다.
    if (sendAlimtalkToCustomer) assertReportSendable(booking.status)

    // 보고서 upsert (booking_id unique 제약)
    const upsertData: Record<string, unknown> = {
      business_id: profile.business_id,
      booking_id:  bookingId,
      notes:       notes ?? null,
      preventive_note: preventiveNote ?? null,
    }
    // 홈 공개 토글 — 값이 전달된 경우에만 반영(부분 저장 시 기존값 보존)
    if (isPublic !== undefined) upsertData.is_public = isPublic
    if (aiReportData) upsertData.ai_report_data = aiReportData
    // ⚠️ 여기서 kakao_sent_at을 미리 넣지 않는다.
    //    예전엔 발송 시도 전에 찍어놓고 실패는 catch로 삼켜서, 고객은 아무것도 못 받았는데
    //    사장님 화면은 '발송 완료'로 잠겼다(2026-08-17 채널 불일치 기간에 실제로 발생).
    //    아래에서 실제 발송이 성공한 뒤에만 기록한다.

    const { data: report, error: reportError } = await db
      .from('reports')
      .upsert(upsertData as never, { onConflict: 'booking_id' })
      .select('id')
      .single()

    if (reportError || !report) {
      console.error('[Reports] upsert 실패:', reportError)
      throw new Error('[APP] 보고서 저장에 실패했습니다')
    }

    // 기존 사진 삭제 후 재입력
    await db.from('report_photos').delete().eq('report_id', report.id)

    const allPhotos = [
      ...beforePhotoUrls.map((url, i) => ({
        report_id:  report.id,
        url,
        type:       'before' as const,
        sort_order: i,
      })),
      ...afterPhotoUrls.map((url, i) => ({
        report_id:  report.id,
        url,
        type:       'after' as const,
        sort_order: i,
      })),
    ]

    if (allPhotos.length > 0) {
      const { error: photoError } = await db.from('report_photos').insert(allPhotos)
      if (photoError) {
        console.error('[Reports] photos insert 실패:', photoError)
      }
    }

    // 알림톡 발송
    let alimtalkSent = false
    if (sendAlimtalkToCustomer && booking.customer_phone) {
      const biz   = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
      const quote = Array.isArray(booking.quotes)     ? booking.quotes[0]     : booking.quotes
      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

      try {
        await sendWorkCompleteAlimtalk({
          customerPhone: booking.customer_phone,
          customerName:  booking.customer_name ?? '고객',
          businessName:  (biz as { name: string; phone: string | null } | null)?.name ?? '',
          businessPhone: (biz as { name: string; phone: string | null } | null)?.phone ?? null,
          cleaningType:  (quote as { cleaning_type: string | null } | null)?.cleaning_type ?? '청소 서비스',
          scheduledAt:   booking.scheduled_at ?? '',
          reportUrl:     `${appBaseUrl}/q/${profile.business_id}/report/${report.id}`,
        })
        // 실제로 나간 뒤에만 '보냈다'고 기록한다
        await db
          .from('reports')
          .update({ kakao_sent_at: new Date().toISOString() })
          .eq('id', report.id)
        alimtalkSent = true
      } catch (err) {
        console.error('[Reports] alimtalk 발송 실패:', err)
      }
    }

    // 정기계약의 '첫 방문'이면 초도 리포트 초안을 만들어 둔다(사장님이 대신 쓴 경우)
    await ensureOnboardingDraft({
      db: db as unknown as SupabaseClient,
      businessId: profile.business_id,
      bookingId,
      contractId: booking.contract_id,
      reportId: report.id,
    })

    // 포트폴리오 초안 자동 생성 (비동기 — 실패해도 보고서 저장에 영향 없음)
    // Before/After 사진 + AI 보고서 데이터가 모두 있을 때만 생성
    if (aiReportData && beforePhotoUrls.length > 0 && afterPhotoUrls.length > 0) {
      createPortfolioDraft(db, report.id).catch((err) => {
        console.error('[Portfolio] 초안 생성 실패:', err)
      })
    }

    revalidatePath('/dashboard/work')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/marketing')
    return { reportId: report.id, alimtalkSent }
  })

// 저장된 보고서 발송 (사장님 전용 — 이미 저장된 보고서에 대한 알림톡 발송)
export const ownerSendReportAction = action
  .schema(z.object({ reportId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db.from('profiles').select('business_id').eq('id', user.id).single()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { data: report } = await db
      .from('reports')
      .select('id, booking_id')
      .eq('id', parsedInput.reportId)
      .eq('business_id', profile.business_id)
      .single()
    if (!report) throw new Error('[APP] 보고서를 찾을 수 없습니다')

    const { data: booking } = await db
      .from('bookings')
      .select('status, customer_name, customer_phone, scheduled_at, quotes!quote_id(cleaning_type), businesses!business_id(name, phone)')
      .eq('id', report.booking_id)
      .eq('business_id', profile.business_id)
      .single()
    if (!booking) throw new Error('[APP] 예약 정보를 찾을 수 없습니다')
    assertReportSendable(booking.status)
    if (!booking.customer_phone) throw new Error('[APP] 고객 연락처가 없어 발송할 수 없어요')

    const biz   = Array.isArray(booking.businesses) ? booking.businesses[0] : booking.businesses
    const quote = Array.isArray(booking.quotes)     ? booking.quotes[0]     : booking.quotes
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

    await sendWorkCompleteAlimtalk({
      customerPhone: booking.customer_phone,
      customerName:  booking.customer_name ?? '고객',
      businessName:  (biz as { name: string; phone: string | null } | null)?.name ?? '',
      businessPhone: (biz as { name: string; phone: string | null } | null)?.phone ?? null,
      cleaningType:  (quote as { cleaning_type: string | null } | null)?.cleaning_type ?? '청소 서비스',
      scheduledAt:   booking.scheduled_at ?? '',
      reportUrl:     `${appBaseUrl}/q/${profile.business_id}/report/${report.id}`,
    })

    await db.from('reports').update({ kakao_sent_at: new Date().toISOString() }).eq('id', parsedInput.reportId)

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/alimtalk-todo')
    return { success: true }
  })

// AI 보고서 자동 작성 (사장님 전용)
export const ownerGenerateAiReportAction = action
  .schema(z.object({
    memo:         z.string().min(5, '메모를 5자 이상 입력해주세요').max(2000),
    serviceItems: z.array(z.object({ name: z.string(), basePrice: z.number() })).optional(),
  }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const result = await generateAiReport(parsedInput.memo, parsedInput.serviceItems)
    return { success: true, report: result }
  })

const sendReviewSchema = z.object({
  reportId: z.string().uuid(),
})

export const sendReviewRequestAction = action
  .schema(sendReviewSchema)
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

    // 보고서 + 예약 + 업체 정보 조회
    const { data: report } = await db
      .from('reports' as never)
      .select('id, booking_id, bookings!booking_id(status, contract_id, customer_name, customer_phone, worker_id, workers!worker_id(name), quotes!quote_id(cleaning_type)), businesses!business_id(name, naver_place_url, google_place_url, danggeun_review_url, kakao_place_url, active_review_platform, review_reward_type, review_reward_description)' as never)
      .eq('id' as never, parsedInput.reportId)
      .eq('business_id' as never, profile.business_id)
      .single() as unknown as { data: { id: string; booking_id: string | null; bookings: unknown; businesses: unknown } | null }

    if (!report) throw new Error('[APP] 보고서 정보를 찾을 수 없습니다')

    const booking = Array.isArray(report.bookings) ? report.bookings[0] : report.bookings

    // 작업이 끝나지 않은 예약에는 후기를 부탁하지 않는다.
    // 목록에서 걸러도 링크를 직접 열거나 예전 화면이 남아 있으면 발송될 수 있어 여기서도 막는다.
    const bookingStatus = (booking as { status?: string | null } | null)?.status
    if (bookingStatus !== 'completed') {
      throw new Error('[APP] 아직 작업이 끝나지 않은 일정이에요. 완료 처리한 뒤에 후기를 요청해주세요')
    }

    // 정기 거래처에는 후기를 요청하지 않는다 — 매 방문마다 조르는 꼴이 된다.
    // 후기 요청은 일회성 고객을 재구매로 이어가기 위한 것이다.
    if ((booking as { contract_id?: string | null } | null)?.contract_id) {
      throw new Error('[APP] 정기 거래처에는 후기 요청을 보내지 않아요')
    }
    const biz     = Array.isArray(report.businesses) ? report.businesses[0] : report.businesses
    const bizInfo = biz as { name: string; naver_place_url: string | null; google_place_url: string | null; danggeun_review_url: string | null; kakao_place_url: string | null; active_review_platform: string; review_reward_type: string; review_reward_description: string | null } | null
    const bookingInfo = booking as { customer_name: string | null; customer_phone: string | null; worker_id: string | null; workers: { name: string | null } | { name: string | null }[] | null; quotes: { cleaning_type: string | null } | { cleaning_type: string | null }[] | null } | null
    const quote   = Array.isArray(bookingInfo?.quotes) ? bookingInfo?.quotes[0] : bookingInfo?.quotes

    // 활성 채널 기준 리뷰 URL 결정
    const platformUrlMap: Record<string, string | null> = {
      naver: bizInfo?.naver_place_url ?? null,
      google: bizInfo?.google_place_url ?? null,
      danggeun: bizInfo?.danggeun_review_url ?? null,
      kakao: bizInfo?.kakao_place_url ?? null,
    }
    const activeUrl = platformUrlMap[bizInfo?.active_review_platform ?? 'naver'] ?? bizInfo?.naver_place_url ?? bizInfo?.google_place_url
    if (!activeUrl) throw new Error('[APP] 설정에서 리뷰 수집 채널 URL을 먼저 등록해주세요')
    if (!bookingInfo?.customer_phone) throw new Error('[APP] 고객 연락처가 없습니다')

    // 현장 마감·크론과 같은 경로로 보낸다 — 인증 페이지(/review/토큰)를 거쳐야
    // 발송·클릭·작성이 기록되고 담당 기사 성과에도 잡힌다.
    const token = randomBytes(20).toString('hex')
    await db.from('review_claims').insert({
      booking_id:     report.booking_id,
      business_id:    profile.business_id,
      customer_phone: bookingInfo.customer_phone,
      token,
      is_followup:    false,
      worker_id:      bookingInfo.worker_id,
    } as never)

    const workerRow = Array.isArray(bookingInfo.workers) ? bookingInfo.workers[0] : bookingInfo.workers
    const rewardValue = bizInfo?.review_reward_description
    const rewardText =
      bizInfo?.review_reward_type === 'discount_rate' && rewardValue
        ? `후기 남겨주시면 다음 이용 시 ${rewardValue}% 할인해 드려요`
        : bizInfo?.review_reward_type === 'discount_amount' && rewardValue
          ? `후기 남겨주시면 다음 이용 시 ${Number(rewardValue).toLocaleString()}원 할인해 드려요`
          : null

    await sendReviewRequestAlimtalk({
      customerPhone: bookingInfo.customer_phone,
      customerName:  bookingInfo.customer_name ?? '고객',
      businessName:  bizInfo?.name ?? '',
      cleaningType:  (quote as { cleaning_type: string | null } | null)?.cleaning_type ?? '청소 서비스',
      reviewToken:   token,
      workerName:    workerRow?.name ?? null,
      rewardText,
    })

    // 리뷰 요청 발송 시각 기록
    await db
      .from('reports')
      .update({ review_request_sent_at: new Date().toISOString() })
      .eq('id', parsedInput.reportId)

    return { success: true }
  })

// 보고서 발송 건너뛰기 (발송 안 하고 완료 처리)
export const skipReportSendAction = action
  .schema(z.object({ reportId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db.from('profiles').select('business_id').eq('id', user.id).single()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { data: report } = await db
      .from('reports')
      .select('id')
      .eq('id', parsedInput.reportId)
      .eq('business_id', profile.business_id)
      .single()
    if (!report) throw new Error('[APP] 보고서를 찾을 수 없습니다')

    // 발송·리뷰 요청 모두 완료 처리 (미발송 목록에서 제거)
    const now = new Date().toISOString()
    await db
      .from('reports')
      .update({ kakao_sent_at: now, review_request_sent_at: now })
      .eq('id', parsedInput.reportId)

    revalidatePath('/dashboard/alimtalk-todo')
    revalidatePath('/dashboard/schedule')
    return { success: true }
  })

// 보고서를 아직 안 만든 예약을 '안 보내고 넘김' 처리.
//
// 위 skipReportSendAction은 보고서 행이 있어야 표시할 수 있다. 보고서를 만들지 않고
// 넘기려면 표시할 곳이 없어(빈 보고서를 만들면 고객 이력에 백지 링크가 생긴다)
// 예약 쪽 report_skipped_at에 기록한다.
export const skipBookingReportAction = action
  .schema(z.object({ bookingId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db.from('profiles').select('business_id').eq('id', user.id).single()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { data: booking } = await db
      .from('bookings')
      .select('id')
      .eq('id', parsedInput.bookingId)
      .eq('business_id', profile.business_id)
      .maybeSingle()
    if (!booking) throw new Error('[APP] 예약을 찾을 수 없습니다')

    // report_skipped_at은 database.ts 타입에 아직 없어 단언 (CLAUDE.md 새 컬럼 패턴)
    await db
      .from('bookings')
      .update({ report_skipped_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.bookingId)

    revalidatePath('/dashboard/alimtalk-todo')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 리뷰 요청 건너뛰기 (요청을 보내지 않고 목록에서만 제거)
export const skipReviewRequestAction = action
  .schema(z.object({ reportId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db.from('profiles').select('business_id').eq('id', user.id).single()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    const { data: report } = await db
      .from('reports')
      .select('id')
      .eq('id', parsedInput.reportId)
      .eq('business_id', profile.business_id)
      .maybeSingle()
    if (!report) throw new Error('[APP] 보고서를 찾을 수 없습니다')

    // 발송 시각을 채워 '처리됨'으로 둔다 — 이 값은 할 일 목록 표시에만 쓰이고
    // 리뷰 성과 집계는 review_claims(실제 작성 기록)로 하므로 통계가 부풀지 않는다.
    await db
      .from('reports')
      .update({ review_request_sent_at: new Date().toISOString() })
      .eq('id', parsedInput.reportId)

    revalidatePath('/dashboard/alimtalk-todo')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { success: true }
  })

// 완성된 릴스 건너뛰기 (작업물 목록에서 제거)
export const dismissReelAction = action
  .schema(z.object({ reportId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db.from('profiles').select('business_id').eq('id', user.id).single()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

    // reel_status를 dismissed로 변경하여 작업물 목록에서 제거
    await db
      .from('reports' as never)
      .update({ reel_status: 'dismissed' } as never)
      .eq('id' as never, parsedInput.reportId)
      .eq('business_id' as never, profile.business_id)

    revalidatePath('/dashboard/marketing')
    revalidatePath('/dashboard')
    return { success: true }
  })
