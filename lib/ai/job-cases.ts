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
