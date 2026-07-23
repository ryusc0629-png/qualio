import 'server-only'
import type { createServiceClient } from '@/lib/supabase/server'
import { buildGeoQuestions } from '@/lib/geo/questions'
import { measureGeoShareOfVoice, type GeoMeasureResult } from '@/lib/geo/measure'

// GEO 측정 1회 실행의 "코어" — 수동 액션(버튼)과 주기 cron이 공용으로 쓴다.
// 흐름: 질문 세트 보장(월 단위 캐시) → Perplexity 검색 측정 → geo_checks에 1행 저장.

type Db = ReturnType<typeof createServiceClient>

// geo 테이블은 database.ts 타입에 아직 없어 캐스팅으로 접근(CLAUDE.md 규칙)
type GeoQuestionRow = { id: string; question: string; created_month: string | null }

// 현재 월 키(KST 기준) — 'YYYY-MM'. 질문 세트 재생성 주기의 캐시 키.
export function currentMonthKey(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`
}

// 이번 달 활성 질문을 보장한다. 없거나 이전 달 것이면 새로 생성해 교체.
// 반환: 이번 측정에 쓸 질문 문자열 배열(없으면 빈 배열 — 지역·서비스 부족).
export async function ensureGeoQuestions(
  db: Db,
  businessId: string,
  address: string | null,
  serviceNames: string[],
): Promise<string[]> {
  const month = currentMonthKey()

  const { data: existing } = (await db
    .from('geo_questions' as never)
    .select('id, question, created_month' as never)
    .eq('business_id' as never, businessId)
    .eq('active' as never, true)) as unknown as { data: GeoQuestionRow[] | null }

  const rows = existing ?? []
  // 이번 달 질문이 이미 있으면 그대로 사용
  if (rows.length > 0 && rows.every((r) => r.created_month === month)) {
    return rows.map((r) => r.question)
  }

  // 새 질문 생성 — 결정적 템플릿. 지역·서비스가 부족하면 빈 배열.
  const questions = buildGeoQuestions(address, serviceNames)
  if (questions.length === 0) return []

  // 이전 질문 비활성화(추세 기록은 geo_checks에 남으므로 질문은 교체해도 안전)
  if (rows.length > 0) {
    await db
      .from('geo_questions' as never)
      .update({ active: false } as never)
      .eq('business_id' as never, businessId)
      .eq('active' as never, true)
  }

  await db.from('geo_questions' as never).insert(
    questions.map((q) => ({
      business_id: businessId,
      question: q,
      active: true,
      created_month: month,
    })) as never,
  )

  return questions
}

export interface RunGeoCheckResult {
  skipped?: 'no-key' | 'no-questions'
  result?: GeoMeasureResult
}

// 한 업체의 GEO 노출을 측정하고 결과를 저장한다.
// - PERPLEXITY_API_KEY 없으면 skipped:'no-key' (측정 안 함)
// - 지역·서비스 부족으로 질문이 없으면 skipped:'no-questions'
export async function runGeoCheck(db: Db, businessId: string): Promise<RunGeoCheckResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) return { skipped: 'no-key' }

  // 업체 식별 정보 + 서비스 조회
  const { data: biz } = (await db
    .from('businesses')
    .select('name, slug, address' as never)
    .eq('id', businessId)
    .maybeSingle()) as unknown as {
    data: { name: string | null; slug: string | null; address: string | null } | null
  }
  if (!biz) return { skipped: 'no-questions' }

  const { data: services } = await db
    .from('service_items')
    .select('name')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)

  const serviceNames = (services ?? []).map((s) => s.name as string)

  const questions = await ensureGeoQuestions(db, businessId, biz.address, serviceNames)
  if (questions.length === 0) return { skipped: 'no-questions' }

  // 식별 신호(needles) — 업체명·slug가 검색 결과 제목/URL/스니펫에 있으면 "노출"로 판정.
  // 2자 미만은 오탐 위험이 커서 제외.
  const needles = [biz.name, biz.slug]
    .filter((v): v is string => !!v && v.trim().length >= 2)
    .map((v) => v.trim())

  const result = await measureGeoShareOfVoice(apiKey, questions, { needles })

  // 측정 1회 = geo_checks 1행. 질문별 상세는 detail(jsonb)에 저장.
  await db.from('geo_checks' as never).insert({
    business_id: businessId,
    engine: 'perplexity',
    total: result.total,
    cited: result.cited,
    share_pct: result.sharePct,
    detail: result.results.map((r) => ({
      query: r.query,
      mentioned: r.mentioned,
      topDomains: r.topDomains,
    })),
  } as never)

  return { result }
}
