import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { ReportPhotoSection } from './report-photos'

function formatKoreanDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

// AI 보고서 포맷인지 확인 후 파싱
function parseAiReportNotes(notes: string): {
  isAiReport: boolean
  sections: { icon: string; title: string; content: string }[]
  recommendedServiceNames: string[]
  rawText: string
} {
  const sectionPatterns = [
    { marker: '작업 전 상태', icon: '📋', title: '작업 전 상태' },
    { marker: '작업 내용', icon: '🔧', title: '작업 내용' },
    { marker: '작업 결과', icon: '✨', title: '작업 결과' },
    { marker: '참고사항', icon: '📌', title: '참고사항' },
  ]

  const hasAllSections = sectionPatterns.every((p) => notes.includes(p.marker))
  if (!hasAllSections) return { isAiReport: false, sections: [], recommendedServiceNames: [], rawText: notes }

  // 추천 서비스 파싱 (참고사항 뒤에 "💡 추천 서비스" 섹션이 있을 수 있음)
  const recMarker = '추천 서비스'
  const recIdx = notes.indexOf(recMarker)
  const notesForSections = recIdx > -1 ? notes.slice(0, notes.lastIndexOf('💡')) : notes

  const sections: { icon: string; title: string; content: string }[] = []
  for (let i = 0; i < sectionPatterns.length; i++) {
    const current = sectionPatterns[i]
    const next = sectionPatterns[i + 1]
    const startIdx = notesForSections.indexOf(current.marker)
    const contentStart = startIdx + current.marker.length
    const endIdx = next ? notesForSections.indexOf(next.marker) : notesForSections.length
    const raw = notesForSections.slice(contentStart, endIdx).replace(/^[\s\n]+|[\s\n]+$/g, '')
    if (raw) {
      sections.push({ icon: current.icon, title: current.title, content: raw })
    }
  }

  // 추천 서비스명 파싱
  let recommendedServiceNames: string[] = []
  if (recIdx > -1) {
    const recContent = notes.slice(recIdx + recMarker.length).trim()
    recommendedServiceNames = recContent.split(',').map((s) => s.trim()).filter(Boolean)
  }

  return { isAiReport: sections.length > 0, sections, recommendedServiceNames, rawText: notes }
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ businessId: string; reportId: string }>
}) {
  const { businessId, reportId } = await params
  const db = createServiceClient()

  // 보고서 + 예약 + 업체 정보 조회
  const { data: report } = await db
    .from('reports')
    .select(`
      id, notes, created_at,
      bookings!booking_id(
        customer_name,
        customer_phone,
        scheduled_at,
        service_address,
        selected_tier,
        quotes!quote_id(cleaning_type, space_size)
      ),
      businesses!business_id(name, phone, naver_place_url)
    `)
    .eq('id', reportId)
    .eq('business_id', businessId)
    .single()

  if (!report) notFound()

  const { data: photos } = await db
    .from('report_photos')
    .select('id, url, type, caption, sort_order')
    .eq('report_id', reportId)
    .order('type')
    .order('sort_order')

  const booking = Array.isArray(report.bookings) ? report.bookings[0] : report.bookings
  const biz     = Array.isArray(report.businesses) ? report.businesses[0] : report.businesses
  const quote   = Array.isArray(booking?.quotes) ? booking?.quotes[0] : booking?.quotes

  const bizInfo = biz as { name: string; phone: string | null; naver_place_url: string | null } | null
  const bookingInfo = booking as {
    customer_name: string | null
    customer_phone: string | null
    scheduled_at: string | null
    service_address: string | null
    selected_tier: string | null
  } | null
  const quoteInfo = quote as { cleaning_type: string | null; space_size: number | null } | null

  const beforePhotos = (photos ?? []).filter((p) => p.type === 'before')
  const afterPhotos  = (photos ?? []).filter((p) => p.type === 'after')

  const TIER_LABEL: Record<string, string> = {
    good: '기본', better: '추천', best: '프리미엄',
  }

  // AI 보고서 파싱
  const reportNotes = report.notes
    ? parseAiReportNotes(report.notes as string)
    : null

  // 추천 서비스가 있으면 해당 서비스 정보 조회
  const recommendedNames = reportNotes?.recommendedServiceNames ?? []
  let recommendedServices: { name: string; basePrice: number }[] = []
  if (recommendedNames.length > 0) {
    const { data: svcItems } = await db
      .from('service_items')
      .select('name, base_price')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null)
    if (svcItems) {
      recommendedServices = svcItems
        .filter((s) => recommendedNames.includes(s.name))
        .map((s) => ({ name: s.name, basePrice: s.base_price }))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">작업 완료 보고서</p>
            <p className="text-sm text-muted-foreground">{bizInfo?.name ?? '업체'}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* 작업 정보 */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">작업 정보</p>
          <div className="space-y-2">
            {quoteInfo?.cleaning_type && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">서비스</span>
                <span className="font-semibold">
                  {quoteInfo.cleaning_type}
                  {quoteInfo.space_size && <span className="text-muted-foreground font-normal"> {quoteInfo.space_size}평</span>}
                </span>
              </div>
            )}
            {bookingInfo?.selected_tier && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">선택 플랜</span>
                <span className="font-semibold">{TIER_LABEL[bookingInfo.selected_tier] ?? bookingInfo.selected_tier}</span>
              </div>
            )}
            {bookingInfo?.scheduled_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">작업 일시</span>
                <span className="font-semibold">{formatKoreanDate(bookingInfo.scheduled_at)}</span>
              </div>
            )}
            {bookingInfo?.service_address && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground shrink-0">주소</span>
                <span className="font-semibold text-right ml-4">{bookingInfo.service_address}</span>
              </div>
            )}
          </div>
        </div>

        {/* 작업 전 사진 — 클릭 시 라이트박스 */}
        {beforePhotos.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-bold flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black">전</span>
              작업 전
            </p>
            <ReportPhotoSection
              photos={beforePhotos.map((p) => ({ url: p.url, caption: p.caption ?? '작업 전' }))}
            />
          </div>
        )}

        {/* 작업 후 사진 — 클릭 시 라이트박스 */}
        {afterPhotos.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-bold flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-[10px] font-black text-green-800">후</span>
              작업 후
            </p>
            <ReportPhotoSection
              photos={afterPhotos.map((p) => ({ url: p.url, caption: p.caption ?? '작업 후' }))}
            />
          </div>
        )}

        {/* 보고서 내용 — AI 보고서인 경우 구조화 표시 */}
        {reportNotes && (
          reportNotes.isAiReport ? (
            <div className="space-y-3">
              {reportNotes.sections.map((section) => (
                <div key={section.title} className="bg-white rounded-2xl border border-border p-5 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <span>{section.icon}</span> {section.title}
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{section.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">담당자 메모</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{reportNotes.rawText}</p>
            </div>
          )
        )}

        {/* 추천 서비스 */}
        {recommendedServices.length > 0 && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-violet-900">이런 서비스도 함께 추천드려요</p>
              <p className="text-xs text-violet-700">현장 상태를 확인한 결과, 아래 서비스가 도움이 될 수 있어요</p>
            </div>
            <div className="space-y-2">
              {recommendedServices.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-violet-100">
                  <span className="text-sm font-semibold text-violet-900">{svc.name}</span>
                  <span className="text-sm text-violet-600 font-medium">{svc.basePrice.toLocaleString()}원~</span>
                </div>
              ))}
            </div>
            {bizInfo?.phone && (
              <a
                href={`tel:${bizInfo.phone}`}
                className="block w-full text-center bg-violet-600 text-white font-bold text-sm py-3 rounded-xl active:opacity-80 transition-opacity"
              >
                견적 문의하기
              </a>
            )}
          </div>
        )}

        {/* 업체 연락처 */}
        {bizInfo && (
          <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">담당 업체</p>
            <div className="flex items-center justify-between">
              <p className="font-semibold">{bizInfo.name}</p>
              {bizInfo.phone && (
                <a
                  href={`tel:${bizInfo.phone}`}
                  className="text-sm text-primary font-semibold bg-primary/10 px-3 py-1.5 rounded-lg active:bg-primary/20 transition-colors"
                >
                  전화하기
                </a>
              )}
            </div>
          </div>
        )}

        {/* 리뷰 요청 */}
        {bizInfo?.naver_place_url && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 space-y-3 text-center">
            <p className="text-sm font-bold text-yellow-900">서비스가 만족스러우셨나요? ⭐</p>
            <p className="text-xs text-yellow-800 leading-relaxed">
              리뷰 한 줄이 저희에게 큰 힘이 됩니다.<br />30초면 충분해요!
            </p>
            <a
              href={bizInfo.naver_place_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#03C75A] text-white font-bold text-sm py-3 rounded-xl active:opacity-80 transition-opacity"
            >
              네이버 리뷰 남기기 →
            </a>
          </div>
        )}

        {/* 완료 문구 */}
        <div className="text-center py-4 space-y-1">
          <p className="text-sm font-semibold text-green-700">작업이 완료됐어요!</p>
          <p className="text-xs text-muted-foreground">
            {bookingInfo?.customer_name ?? '고객'}님, 이용해 주셔서 감사합니다.
          </p>
        </div>

      </div>
    </div>
  )
}
