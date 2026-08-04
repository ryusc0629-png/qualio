import type { createServiceClient } from '@/lib/supabase/server'

type ServiceDb = ReturnType<typeof createServiceClient>

interface AiReportData {
  beforeStatus: string
  workDetails: string
  afterResult: string
  additionalNotes: string
  recommendedServices: string[]
}

// 최근 실제 작업 사례(익명)를 GEO 글 생성 근거로 쓰기 위해 요약 문자열 배열로 반환한다.
// 고객 식별정보(이름·연락처·주소)는 일절 포함하지 않음 — 전 상태/작업 내용/후 결과만 사용.
// 이 "복제 불가능한 실제 데이터"가 글의 고유성을 높여 AI 검색엔진 인용 가능성을 키운다.
export async function fetchRecentJobCases(
  db: ServiceDb,
  businessId: string,
  limit = 4,
): Promise<string[]> {
  const { data } = await db
    .from('reports')
    .select('ai_report_data, created_at' as never)
    .eq('business_id' as never, businessId)
    .not('ai_report_data' as never, 'is', null)
    .order('created_at' as never, { ascending: false })
    .limit(limit) as unknown as { data: { ai_report_data: AiReportData | null }[] | null }

  return (data ?? [])
    .map((r) => r.ai_report_data)
    .filter((d): d is AiReportData => !!d && !!d.workDetails)
    .map((d) => {
      const parts = [
        d.beforeStatus && `전: ${d.beforeStatus}`,
        d.workDetails && `작업: ${d.workDetails}`,
        d.afterResult && `후: ${d.afterResult}`,
      ].filter(Boolean)
      return parts.join(' / ')
    })
    .filter(Boolean)
}

// 자동 발행 글에 실을 "진짜 비포/애프터 사진"을 가져온다.
// ★사장님이 공개로 승인한(is_public) 작업보고의 사진만 사용 — 미승인 고객 현장 사진이
//   동의 없이 공개되는 것을 막는다(홈 비포/애프터 갤러리와 동일한 승인 기준).
// AI 생성 이미지보다 실제 시공 사진이 청소업 설득력이 훨씬 크다(실사례=복제 불가 해자).
export async function fetchRecentCasePhotos(
  db: ServiceDb,
  businessId: string,
  reportLimit = 3,
): Promise<{ before: string[]; after: string[] }> {
  // 1) 공개 승인된 최근 작업보고 id
  const { data: reports } = await db
    .from('reports')
    .select('id' as never)
    .eq('business_id' as never, businessId)
    .eq('is_public' as never, true as never)
    .order('created_at' as never, { ascending: false })
    .limit(reportLimit) as unknown as { data: { id: string }[] | null }

  const reportIds = (reports ?? []).map((r) => r.id)
  if (reportIds.length === 0) return { before: [], after: [] }

  // 2) 그 보고들의 비포/애프터 사진
  const { data: photos } = await db
    .from('report_photos')
    .select('url, type, sort_order')
    .in('report_id', reportIds)
    .order('sort_order', { ascending: true })

  const before = (photos ?? []).filter((p) => p.type === 'before').map((p) => p.url)
  const after = (photos ?? []).filter((p) => p.type === 'after').map((p) => p.url)
  return { before, after }
}
