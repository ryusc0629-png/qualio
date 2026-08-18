import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ReportPhotoSection } from './report-photos'
import { formatDate } from '@/lib/format/datetime'
import {
  DocPage, DocHeader, DocMeta, DocLede, DocSection, DocText, DocSignature,
} from '@/components/report/document'

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

  // '미리 챙긴 것'은 아직 database.ts 타입에 없어 별도 조회(as never 캐스트)
  const { data: preventiveRow } = (await db
    .from('reports')
    .select('preventive_note' as never)
    .eq('id', reportId)
    .maybeSingle()) as unknown as { data: { preventive_note: string | null } | null }
  const preventiveNote = preventiveRow?.preventive_note ?? null

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

  // 향후 관리 안내 — '언제쯤 무엇이 필요해질지'. 판촉 대신 이걸 남긴다.
  // (추천 서비스 + 가격 배너는 뺐다 — 거래처에 보내는 서류에 판촉이 박히면 격이 떨어진다)
  const { data: careRow } = (await db
    .from('reports')
    .select('care_advice, care_due_at' as never)
    .eq('id', reportId)
    .maybeSingle()) as unknown as {
    data: { care_advice: string | null; care_due_at: string | null } | null
  }
  const careAdvice = careRow?.care_advice ?? null
  const careDueLabel = careRow?.care_due_at
    ? formatDate(careRow.care_due_at, { year: 'numeric', month: 'long' })
    : null

  // 문서 머리말 항목 — 값이 없는 줄은 DocMeta가 알아서 뺀다
  const meta = [
    { k: '고객', v: bookingInfo?.customer_name ?? '' },
    { k: '작업일', v: bookingInfo?.scheduled_at ? formatKoreanDate(bookingInfo.scheduled_at) : '' },
    {
      k: '서비스',
      v: quoteInfo?.cleaning_type
        ? `${quoteInfo.cleaning_type}${quoteInfo.space_size ? ` ${quoteInfo.space_size}평` : ''}${
            bookingInfo?.selected_tier ? ` (${TIER_LABEL[bookingInfo.selected_tier] ?? bookingInfo.selected_tier})` : ''
          }`
        : '',
    },
    { k: '현장', v: bookingInfo?.service_address ?? '' },
  ]

  const docNo = `WR-${report.created_at.slice(2, 4)}${report.created_at.slice(5, 7)}${report.created_at.slice(8, 10)}-${reportId.slice(0, 4).toUpperCase()}`

  // 01·02·03… 은 실제 읽는 순서다. 사진과 본문 절에 이어서 번호를 매긴다.
  let no = 0
  const nextNo = () => String(++no).padStart(2, '0')

  return (
    <DocPage>
      <DocHeader
        businessName={bizInfo?.name ?? '업체'}
        businessPhone={bizInfo?.phone}
        title="작업 완료 보고서"
        docNo={docNo}
      />
      <DocMeta items={meta} />

      <DocLede>
        {bookingInfo?.customer_name ? `${bookingInfo.customer_name}님, ` : ''}의뢰하신 작업을 마쳤습니다.
        진행한 내용과 현장 사진을 아래와 같이 정리해 드립니다.
      </DocLede>

      {/* 작업 전·후 사진 — 누르면 크게 보이고 저장할 수 있다 */}
      {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
        <DocSection no={nextNo()} title="현장 사진" lead="사진을 누르면 크게 보이고, 저장할 수 있어요">
          <div className="space-y-5">
            {beforePhotos.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-400 mb-2">작업 전</p>
                <ReportPhotoSection photos={beforePhotos.map((p) => ({ url: p.url, caption: p.caption ?? '작업 전' }))} />
              </div>
            )}
            {afterPhotos.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-emerald-600 mb-2">작업 후</p>
                <ReportPhotoSection photos={afterPhotos.map((p) => ({ url: p.url, caption: p.caption ?? '작업 후' }))} />
              </div>
            )}
          </div>
        </DocSection>
      )}

      {/* 보고서 본문 — 네 항목으로 정리돼 있으면 절로 나누고, 아니면 메모 한 덩어리 */}
      {reportNotes && (
        reportNotes.isAiReport ? (
          <>
            {reportNotes.sections.map((section) => (
              <DocSection key={section.title} no={nextNo()} title={section.title}>
                <DocText>{section.content}</DocText>
              </DocSection>
            ))}
          </>
        ) : (
          <DocSection no={nextNo()} title="작업 내용">
            <DocText>{reportNotes.rawText}</DocText>
          </DocSection>
        )
      )}

      {/* 미리 챙긴 것 — 문제 생기기 전에 먼저 봐준다는 신뢰 */}
      {preventiveNote && preventiveNote.trim() && (
        <DocSection no={nextNo()} title="미리 챙긴 것 · 지켜볼 것">
          <DocText>{preventiveNote}</DocText>
        </DocSection>
      )}

      {/* 향후 관리 안내 — 판촉이 아니라 관리 소견.
          여기 적힌 시점이 되면 사장님에게 알림이 가서 다시 연락하게 된다. */}
      {careAdvice && careAdvice.trim() && (
        <DocSection no={nextNo()} title="향후 관리 안내">
          <DocText>{careAdvice}</DocText>
          {careDueLabel && (
            <p className="text-[12px] text-slate-500 mt-3">
              {careDueLabel}쯤 다시 점검해 보시길 권해드립니다. 그때 저희가 먼저 연락드리겠습니다.
            </p>
          )}
        </DocSection>
      )}

      {/* 후기 — 문서 끝에 한 줄로 청한다 */}
      {bizInfo?.naver_place_url && (
        <div className="mt-8 border border-slate-200 px-5 py-4 flex items-center justify-between gap-4 flex-wrap break-inside-avoid print:hidden">
          <p className="text-[12px] text-slate-600">
            작업이 만족스러우셨다면 후기 한 줄 남겨주시면 큰 힘이 됩니다.
          </p>
          <a
            href={bizInfo.naver_place_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-semibold text-emerald-700 border border-emerald-600 px-3 py-1.5 hover:bg-emerald-50 transition-colors shrink-0"
          >
            후기 남기기
          </a>
        </div>
      )}

      <DocSignature
        businessName={bizInfo?.name ?? '업체'}
        businessPhone={bizInfo?.phone}
        issuedLabel={formatDate(report.created_at)}
      />
    </DocPage>
  )
}
