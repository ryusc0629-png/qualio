import 'server-only'
import type { createServiceClient } from '@/lib/supabase/server'
import { buildGeoQuestions, toSearchArea, type GeoQuestionInput } from '@/lib/geo/questions'
import { measureGeoShareOfVoice, type GeoMeasureResult, type GeoQuestionResult } from '@/lib/geo/measure'
import { measureGeoShareOfVoiceGemini } from '@/lib/geo/measure-gemini'
import { measureGeoShareOfVoiceOpenAI } from '@/lib/geo/measure-openai'

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
  input: Omit<GeoQuestionInput, 'activeAreas'> & { activeAreas?: string[] | null },
): Promise<{ questions: string[]; changed: boolean }> {
  const month = currentMonthKey()

  const { data: existing } = (await db
    .from('geo_questions' as never)
    .select('id, question, created_month' as never)
    .eq('business_id' as never, businessId)
    .eq('active' as never, true)) as unknown as { data: GeoQuestionRow[] | null }

  const rows = existing ?? []
  const current = rows.map((r) => r.question)

  // 지금 규칙으로 만들어야 할 질문 세트 — 결정적 템플릿. 지역·서비스 부족하면 빈 배열.
  const desired = buildGeoQuestions(input)

  // 생성이 불가능하면(지역·서비스 없음) 기존 질문이라도 있으면 그대로 사용
  if (desired.length === 0) return { questions: current, changed: false }

  // 저장된 질문이 원하는 세트와 동일하면 재생성 없이 그대로 사용(멱등)
  const same =
    current.length === desired.length && desired.every((q) => current.includes(q))
  if (rows.length > 0 && same) return { questions: current, changed: false }

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

  return { questions: desired, changed: true }
}

export interface RunGeoCheckResult {
  skipped?: 'no-key' | 'no-questions' | 'too-soon'
  result?: GeoMeasureResult
}

// 한 업체의 GEO 노출을 측정하고 결과를 저장한다.
// - PERPLEXITY_API_KEY 없으면 skipped:'no-key' (측정 안 함)
// - 지역·서비스 부족으로 질문이 없으면 skipped:'no-questions'
export async function runGeoCheck(
  db: Db,
  businessId: string,
  { minIntervalHours = 0 }: { minIntervalHours?: number } = {},
): Promise<RunGeoCheckResult> {
  const perplexityKey = process.env.PERPLEXITY_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (!perplexityKey && !geminiKey && !openaiKey) return { skipped: 'no-key' }

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

  // 실제로 일한 지역 — 시공 사례라는 근거가 있는 곳부터 공략한다.
  // (예약 주소를 시군구로 접어 많은 순으로 정렬. 없으면 출장 지역 순서를 그대로 쓴다)
  const { data: doneBookings } = (await db
    .from('bookings')
    .select('service_address')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .not('service_address', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)) as unknown as { data: { service_address: string | null }[] | null }

  const areaCount = new Map<string, number>()
  for (const b of doneBookings ?? []) {
    const area = toSearchArea(b.service_address)
    if (!area || !area.includes(' ')) continue // 광역만 나온 주소는 신호가 약해 제외
    areaCount.set(area, (areaCount.get(area) ?? 0) + 1)
  }

  // 영업권 밖에서 어쩌다 한 번 간 곳은 공략 지역이 아니다.
  //
  // 다트클린은 울산 업체인데 '경기 오산시' 질문이 만들어진 적이 있다. 예약 주소에
  // 오산 1건, 성남 1건이 있었고 그걸 "실제로 일한 지역"으로 그대로 받아서다.
  // 한 번 간 곳은 영업권이 아니라 우연이고, 그 지역 질문은 물어봐야 답이 없다.
  //
  // 그렇다고 출장 지역 설정만 믿을 수도 없다. 다트클린은 경주에서 11건을 했는데
  // 출장 지역에 '경북'이 없다(설정이 현실을 못 따라간 경우). 그래서 두 갈래로 본다.
  //   - 사장님이 정한 영업권(출장 지역·사업장 광역) 안이면 → 한 건만 있어도 인정
  //   - 영업권 밖이면 → 여러 번 갔을 때만 인정(우연 한 건을 걸러낸다)
  const MIN_JOBS_OUTSIDE_TERRITORY = 3
  const territory = new Set(
    (biz.service_areas ?? []).map((a) => toSearchArea(a)).filter((a): a is string => !!a),
  )
  const homeMetro = (toSearchArea(biz.address) ?? '').split(' ')[0]
  const inTerritory = (area: string) =>
    territory.has(area) || (!!homeMetro && area.startsWith(`${homeMetro} `))

  const activeAreas = [...areaCount.entries()]
    .filter(([area, count]) => inTerritory(area) || count >= MIN_JOBS_OUTSIDE_TERRITORY)
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area)

  const questionInput: GeoQuestionInput = {
    businessName: biz.name,
    address: biz.address,
    serviceAreas: biz.service_areas,
    serviceNames,
    activeAreas,
  }

  const { questions, changed } = await ensureGeoQuestions(db, businessId, questionInput)
  if (questions.length === 0) return { skipped: 'no-questions' }

  // 너무 자주 재는 것만 막는다. 단 질문 세트가 바뀌었으면 '다른 측정'이므로 통과시킨다 —
  // 검색어 규칙을 고치거나 지역·서비스를 채운 직후엔 바로 결과를 봐야 한다.
  if (!changed && minIntervalHours > 0) {
    const since = new Date(Date.now() - minIntervalHours * 60 * 60 * 1000).toISOString()
    const { data: recent } = (await db
      .from('geo_checks' as never)
      .select('id' as never)
      .eq('business_id' as never, businessId)
      .gte('checked_at' as never, since)
      .limit(1)) as unknown as { data: { id: string }[] | null }
    if (recent && recent.length > 0) return { skipped: 'too-soon' }
  }

  // 식별 신호(needles) — 업체명·slug가 검색결과/답변/인용에 있으면 "노출"로 판정.
  // 2자 미만은 오탐 위험이 커서 제외.
  const needles = [biz.name, biz.slug]
    .filter((v): v is string => !!v && v.trim().length >= 2)
    .map((v) => v.trim())

  // 사용 가능한 엔진 모두로 측정(있는 키만) — Perplexity(검색결과)+Gemini(답변 그라운딩).
  // 엔진끼리도 동시에 돌린다 — 하나씩 기다리면 엔진 수만큼 시간이 곱해진다.
  const engineJobs: { engine: string; run: () => Promise<GeoMeasureResult> }[] = []
  if (perplexityKey) engineJobs.push({ engine: 'perplexity', run: () => measureGeoShareOfVoice(perplexityKey, questions, { needles }) })
  if (geminiKey) engineJobs.push({ engine: 'gemini', run: () => measureGeoShareOfVoiceGemini(geminiKey, questions, { needles }) })
  if (openaiKey) engineJobs.push({ engine: 'openai', run: () => measureGeoShareOfVoiceOpenAI(openaiKey, questions, { needles }) })

  const startedAt = Date.now()
  const settled = await Promise.all(
    engineJobs.map(async (job) => {
      try {
        return { engine: job.engine, results: (await job.run()).results }
      } catch (e) {
        console.error(`[GEO] ${job.engine} 엔진 실패:`, e instanceof Error ? e.message : e)
        return { engine: job.engine, results: [] as GeoQuestionResult[] }
      }
    }),
  )
  const engineResults = settled

  // 비용·시간을 눈으로 볼 수 있게 남긴다 — 질문 수를 올릴지 판단하는 근거가 된다
  console.log(
    `[GEO] 측정 완료 business=${businessId} 질문=${questions.length} 엔진=${engineJobs.length} ` +
    `호출=${questions.length * engineJobs.length} 소요=${Math.round((Date.now() - startedAt) / 1000)}초`,
  )

  // 질문별 엔진 통합 — 어느 엔진에서든 잡히면 노출(union), 인용 도메인은 합집합.
  // detail에 엔진별 결과(engines)도 남겨 대시보드에서 "엔진별" 표시에 활용.
  const detail = questions.map((q, i) => {
    const engines: Record<string, boolean> = {}
    const domains = new Set<string>()
    // 답변에 함께 나온 업체 이름 — 짧은 추천 질문은 AI가 지도로 답해 웹사이트가 아니라
    // 상호가 뜬다. 도메인만 모으면 정작 우리와 겨루는 업체가 누군지 안 보인다.
    const names = new Set<string>()
    let mentioned = false
    for (const er of engineResults) {
      const r = er.results[i]
      const m = r?.mentioned ?? false
      engines[er.engine] = m
      if (m) mentioned = true
      for (const d of r?.topDomains ?? []) if (d) domains.add(d)
      for (const n of r?.names ?? []) if (n) names.add(n)
    }
    return {
      query: q,
      mentioned,
      topDomains: [...domains].slice(0, 4),
      names: [...names].slice(0, 6),
      engines,
    }
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
