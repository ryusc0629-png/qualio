import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FieldReportClient } from './field-report-client'
import { isFirstVisitOfContract } from '@/lib/onboarding/draft-from-field'
import { monthsUntil } from '@/lib/reports/care-due'

// workers 테이블 타입 (Supabase 타입 아직 미생성)
interface WorkerRow {
  id: string
  name: string
  business_id: string
  is_active: boolean
}

interface Props {
  params: Promise<{ workerId: string; bookingId: string }>
}

export default async function FieldReportPage({ params }: Props) {
  const { workerId, bookingId } = await params
  const db = createServiceClient()

  // 직원 검증
  const { data: worker } = await db
    .from('workers' as never)
    .select('id, name, business_id, is_active' as never)
    .eq('id' as never, workerId)
    .maybeSingle() as { data: WorkerRow | null }

  if (!worker || !worker.is_active) notFound()

  // 예약 조회
  const { data: booking } = await db
    .from('bookings')
    .select('id, customer_name, customer_phone, service_address, scheduled_at, status, contract_id' as never)
    .eq('id', bookingId)
    .eq('business_id', worker.business_id)
    .eq('worker_id' as never, workerId)
    .maybeSingle() as unknown as {
      data: {
        id: string
        customer_name: string
        customer_phone: string | null
        service_address: string | null
        scheduled_at: string
        status: string
        contract_id: string | null
      } | null
    }

  if (!booking) notFound()

  // 기존 보고서 + 사진 + 릴스 정보 조회
  const { data: report } = await db
    .from('reports')
    .select('id, notes, preventive_note, care_advice, care_due_at, kakao_sent_at, ai_report_data, work_clip_urls, reel_status, reel_url, report_photos(url, type, sort_order, caption)' as never)
    .eq('booking_id', bookingId)
    .maybeSingle() as { data: {
      id: string; notes: string | null; preventive_note: string | null
      care_advice: string | null; care_due_at: string | null; kakao_sent_at: string | null
      ai_report_data: { beforeStatus: string; workDetails: string; afterResult: string; additionalNotes: string; recommendedServices: string[] } | null
      work_clip_urls: string[] | null
      reel_status: string | null
      reel_url: string | null
      report_photos: { url: string; type: string; sort_order: number; caption: string | null }[]
    } | null }

  const photos = report?.report_photos ?? []

  // 사진마다 '어디'(caption)도 함께 넘긴다 — 초도 방문에서 직원이 적은 위치가
  // 다시 열었을 때 그대로 보여야 한다
  const existingBefore = photos
    .filter((p) => p.type === 'before')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ url: p.url, caption: p.caption ?? '' }))

  const existingAfter = photos
    .filter((p) => p.type === 'after')
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ url: p.url, caption: p.caption ?? '' }))

  // 업체 서비스 항목 조회 (AI 추천용)
  const { data: services } = await db
    .from('service_items')
    .select('name, base_price')
    .eq('business_id', worker.business_id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order')

  // 이 방문이 계약의 '첫 방문'인지 — 초도 리포트는 계약당 한 번뿐이라
  // 첫 방문에서만 안내를 띄운다(직원이 할 일은 늘지 않는다)
  const isFirstVisit = booking.contract_id
    ? await isFirstVisitOfContract(
        db as unknown as SupabaseClient,
        worker.business_id,
        booking.contract_id,
        booking.id,
      )
    : false

  return (
    <FieldReportClient
      workerId={workerId}
      businessId={worker.business_id}
      booking={{
        id: booking.id,
        customerName: booking.customer_name,
        customerPhone: booking.customer_phone,
        serviceAddress: booking.service_address,
        scheduledAt: booking.scheduled_at,
        contractId: booking.contract_id ?? null,
        isFirstVisit,
      }}
      existingReport={report ? {
        id: report.id,
        notes: report.notes,
        preventiveNote: report.preventive_note,
        careAdvice: report.care_advice,
        // 저장된 기한에서 몇 개월짜리였는지 되짚는다. 기록이 없으면 기본 6개월
        careMonths: monthsUntil(report.care_due_at) ?? 6,
        sentAt: report.kakao_sent_at,
        beforeUrls: existingBefore,
        afterUrls: existingAfter,
        aiReportData: report.ai_report_data ?? null,
        workClipUrls: report.work_clip_urls ?? [],
        reelStatus: report.reel_status ?? 'idle',
        reelUrl: report.reel_url ?? null,
      } : null}
      serviceItems={(services ?? []).map((s) => ({
        name: s.name,
        basePrice: s.base_price,
      }))}
    />
  )
}
