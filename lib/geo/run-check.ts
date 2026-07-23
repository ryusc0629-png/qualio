import 'server-only'
import type { createServiceClient } from '@/lib/supabase/server'
import { buildGeoQuestions } from '@/lib/geo/questions'
import { measureGeoShareOfVoice, type GeoMeasureResult, type GeoQuestionResult } from '@/lib/geo/measure'
import { measureGeoShareOfVoiceGemini } from '@/lib/geo/measure-gemini'

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

// 활성 질문을 보장한다. 저장된 질문이 "지금 생성 결과"와 다르면 자동 재생성해 교체.
// (주소·서비스·영업지역이 바뀌거나 생성 규칙이 개선되면 다음 측정 때 자동 반영 — 멱등)
// 반환: 이번 측정에 쓸 질문 문자열 배열(없으면 빈 배열 — 지역·서비스 부족).
export async function ensureGeoQuestions(
  db: Db,
  businessId: string,
  address: string | null,
  serviceAreas: string[] | null,
  serviceNames: string[],
): Promise<string[]> {
  const month = currentMonthKey()

  const { data: existing } = (await db
    .from('geo_questions' as never)
    .select('id, question, created_month' as never)
    .eq('business_id' as never, businessId)
    .eq('active' as never, true)) as unknown as { data: GeoQuestionRow[] | null }

  const rows = existing ?? []
  const current = rows.map((r) => r.question)

  // 지금 규칙으로 만들어야 할 질문 세트 — 결정적 템플릿. 지역·서비스 부족하면 빈 배열.
  const desired = buildGeoQuestions(address, serviceAreas, serviceNames)

  // 생성이 불가능하면(지역·서비스 없음) 기존 질문이라도 있으면 그대로 사용
  if (desired.length === 0) return current

  // 저장된 질문이 원하는 세트와 동일하면 재생성 없이 그대로 사용(멱등)
  const same =
    current.length === desired.length && desired.every((q) => current.includes(q))
  if (rows.length > 0 && same) return current

  // 다르면 교체: 기존 활성 질문 비활성화 후 새 세트 삽입
  // (추세 기록은 geo_checks에 남으므로 질문 교체는 안전)
  if (rows.length > 0) {
    await db
      .from('geo_questions' as never)
      .update({ active: false } as never)
      .eq('business_id' as never, businessId)
      .eq('active' as never, true)
  }

  await db.from('geo_questions' as never).insert(
    desired.map((q) => ({
      business_id: businessId,
      question: q,
      active: true,
      created_month: month,
    })) as never,
  )

  return desired
}

export interface RunGeoCheckResult {
  skipped?: 'no-key' | 'no-questions'
  result?: GeoMeasureResult
}

// 한 업체의 GEO 노출을 측정하고 결과를 저장한다.
// - PERPLEXITY_API_KEY 없으면 skipped:'no-key' (측정 안 함)
// - 지역·서비스 부족으로 질문이 없으면 skipped:'no-questions'
export async function runGeoCheck(db: Db, businessId: string): Promise<RunGeoCheckResult> {
  const perplexityKey = process.env.PERPLEXITY_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!perplexityKey && !geminiKey) return { skipped: 'no-key' }

  // 업체 식별 정보 + 영업지역 + 서비스 조회
  const { data: biz } = (await db
    .from('businesses')
    .select('name, slug, address, service_areas' as never)
    .eq('id', businessId)
    .maybeSingle()) as unknown as {
    data: { name: string | null; slug: string | null; address: string | null; service_areas: string[] | null } | null
  }
  if (!biz) return { skipped: 'no-questions' }

  const { data: services } = await db
    .from('service_items')
    .select('name')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)

  const serviceNames = (services ?? []).map((s) => s.name as string)

  const questions = await ensureGeoQuestions(db, businessId, biz.address, biz.service_areas, serviceNames)
  if (questions.length === 0) return { skipped: 'no-questions' }

  // 식별 신호(needles) — 업체명·slug가 검색결과/답변/인용에 있으면 "노출"로 판정.
  // 2자 미만은 오탐 위험이 커서 제외.
  const needles = [biz.name, biz.slug]
    .filter((v): v is string => !!v && v.trim().length >= 2)
    .map((v) => v.trim())

  // 사용 가능한 엔진 모두로 측정(있는 키만) — Perplexity(검색결과)+Gemini(답변 그라운딩).
  const engineResults: { engine: string; results: GeoQuestionResult[] }[] = []
  if (perplexityKey) {
    const r = await measureGeoShareOfVoice(perplexityKey, questions, { needles })
    engineResults.push({ engine: 'perplexity', results: r.results })
  }
  if (geminiKey) {
    const r = await measureGeoShareOfVoiceGemini(geminiKey, questions, { needles })
    engineResults.push({ engine: 'gemini', results: r.results })
  }

  // 질문별 엔진 통합 — 어느 엔진에서든 잡히면 노출(union), 인용 도메인은 합집합.
  // detail에 엔진별 결과(engines)도 남겨 대시보드에서 "엔진별" 표시에 활용.
  const detail = questions.map((q, i) => {
    const engines: Record<string, boolean> = {}
    const domains = new Set<string>()
    let mentioned = false
    for (const er of engineResults) {
      const r = er.results[i]
      const m = r?.mentioned ?? false
      engines[er.engine] = m
      if (m) mentioned = true
      for (const d of r?.topDomains ?? []) if (d) domains.add(d)
    }
    return { query: q, mentioned, topDomains: [...domains].slice(0, 4), engines }
  })

  const cited = detail.filter((d) => d.mentioned).length
  const total = questions.length
  const sharePct = total ? Math.round((cited / total) * 100) : 0
  const engineLabel = engineResults.map((e) => e.engine).join('+') // 예: 'perplexity+gemini'

  // 측정 1회 = geo_checks 1행. 질문별 상세(엔진별 포함)는 detail(jsonb)에 저장.
  await db.from('geo_checks' as never).insert({
    business_id: businessId,
    engine: engineLabel,
    total,
    cited,
    share_pct: sharePct,
    detail,
  } as never)

  return {
    result: {
      results: detail.map((d) => ({ query: d.query, mentioned: d.mentioned, matchedUrl: null, topDomains: d.topDomains })),
      cited,
      total,
      sharePct,
    },
  }
}
