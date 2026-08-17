import 'server-only'
import type { createServiceClient } from '@/lib/supabase/server'
import { generateTopicSuggestions, generateGeoTitles, isKeywordishTitle, keywordToCopyTitle, type TopicSuggestion } from '@/lib/ai/geo-content'
import { deriveKeyword } from '@/lib/geo/weak-topics'

// 자동 발행 '계획표'를 월 1회 확정해 DB(businesses.post_plan)에 고정 저장한다.
// → 달력 미리보기·크론 자동발행·수동 '지금 발행'이 모두 이 고정 계획을 그대로 따른다.
//   (렌더할 때마다 재계산하지 않으므로 예정 주제가 이리저리 바뀌지 않는다.)

type Db = ReturnType<typeof createServiceClient>

export interface PlanSlot {
  day: number              // 발행 예정 '일'(1~31)
  label: string            // 카피라이팅된 발행 제목 — 달력 표시 & 실제 발행 제목이 동일
  topic: string            // 글 생성에 넘길 주제(맥락)
  keyword: string | null   // 핵심 검색 키워드(있으면 제목·본문 최적화)
  geoTargeted: boolean     // GEO '안 잡히는 질문' 슬롯 → 'AI 검색 공략' 배지
  monthlySearches?: number // 추천 주제의 실제 월 검색량(있으면 배지)
  competition?: string     // 경쟁도 '낮음'|'중간'|'높음'
}

export interface PostPlan {
  month: string            // 계획 확정 월 'YYYY-MM'(KST)
  slots: PlanSlot[]        // day 오름차순
}

// 균등 분포로 이번 달 발행 예정일 계산 (post-list.tsx buildSchedule과 동일 규칙)
function scheduledDaysOfMonth(target: number, daysInMonth: number): number[] {
  const days: number[] = []
  let simCount = 0
  for (let day = 1; day <= daysInMonth; day++) {
    if (simCount >= target) break
    const needed = Math.floor((target * day) / daysInMonth) - simCount
    for (let i = 0; i < needed; i++) {
      days.push(day)
      simCount++
    }
  }
  // 하루 1건 기준이라 중복은 없지만, 안전하게 distinct 처리
  return [...new Set(days)]
}

interface PlanContext {
  month: string            // 'YYYY-MM'(KST)
  currentMonthNum: number  // 1~12
  daysInMonth: number
  today: number            // 오늘 '일'(KST)
  target: number           // 이번 달 발행 목표(=autoPostLimit)
  businessName: string
  address: string | null
  publishedDays: Set<number> // 이번 달 이미 발행된 '일'(KST)
}

// 이번 달 계획표를 새로 생성한다. 주제 큐 = GEO 약점 질문(원본 순서) + 월간 추천.
// ★ '이미 다룬 주제 제외' 같은 재선택은 하지 않는다 — 계획을 흔들지 않기 위함.
async function buildMonthlyPlan(db: Db, businessId: string, ctx: PlanContext): Promise<PostPlan> {
  // 1) GEO 최신 측정의 '안 잡히는 질문'(원본 순서 그대로)
  const { data: geoRow } = (await db
    .from('geo_checks' as never)
    .select('detail' as never)
    .eq('business_id' as never, businessId)
    .order('checked_at' as never, { ascending: false })
    .limit(1)
    .maybeSingle()) as unknown as { data: { detail: { query: string; mentioned: boolean }[] } | null }
  const weak = (geoRow?.detail ?? []).filter((d) => !d.mentioned).map((d) => d.query)

  // 2) 발행 예정일 중 '오늘 이후 & 아직 발행 안 된' 날짜
  const futureDays = scheduledDaysOfMonth(ctx.target, ctx.daysInMonth)
    .filter((d) => d >= ctx.today && !ctx.publishedDays.has(d))

  // 3) 주제 큐 — 약점 질문 먼저(AI 검색 공략). 날짜를 다 못 채우면 그때만 월간 추천을 생성해 보충
  //    (약점 질문만으로 충분하면 추천 생성 AI 호출을 생략해 첫 렌더 지연을 줄인다.)
  //    weak 슬롯의 title은 일단 원문(질문)으로 두고, 아래에서 카피라이팅 제목으로 일괄 치환.
  const queue: Omit<PlanSlot, 'day'>[] = weak.map((q) => ({
    label: q,
    topic: q,
    keyword: deriveKeyword(q) || null,
    geoTargeted: true,
  }))

  if (queue.length < futureDays.length) {
    const { data: services } = await db
      .from('service_items')
      .select('name, base_price, unit')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null)
    try {
      // ★검색량·경쟁도를 반드시 함께 받아온다(skipKeywordData를 켜지 말 것).
      //   달력의 '월 N회 / 경쟁 낮음' 배지가 읽는 값이 바로 여기서 채워지는 monthlySearches다.
      //   계획은 월 1회만 만들어 저장하므로 네이버 API 호출도 업체당 월 1회뿐이고,
      //   실패하거나 키가 없으면 배지 없이 주제만 남는다(6초 타임아웃·예외 무시).
      const suggestions: TopicSuggestion[] = await generateTopicSuggestions({
        businessName: ctx.businessName,
        services: (services ?? []) as { name: string; base_price: number; unit: string }[],
        currentMonth: ctx.currentMonthNum,
        address: ctx.address,
      })
      for (const s of suggestions) {
        queue.push({
          label: s.title, // 추천 주제는 이미 카피라이팅된 제목
          topic: s.topic,
          keyword: s.keyword ?? null,
          geoTargeted: false,
          monthlySearches: s.monthlySearches,
          competition: s.competition,
        })
      }
    } catch {
      // 추천 생성 실패해도 약점 질문만으로 계획 진행(부족분은 순환 배정)
    }
  }

  const slots: PlanSlot[] = futureDays.map((day, i) => {
    if (queue.length === 0) {
      return { day, label: '최적 주제를 자동으로 선택해요', topic: '', keyword: null, geoTargeted: false }
    }
    // 주제가 날짜보다 적으면 순환(현 시점 데이터로는 거의 발생하지 않음)
    return { ...queue[i % queue.length], day }
  })

  // 4) 약점 슬롯의 제목을 카피라이팅된 지역 롱테일 제목으로 일괄 치환(1회 호출).
  //    → 달력에 딱딱한 검색어 대신 실제 발행될 제목이 보이고, 발행도 이 제목을 그대로 사용.
  const weakIdx = slots.map((s, i) => (s.geoTargeted ? i : -1)).filter((i) => i >= 0)
  if (weakIdx.length > 0) {
    const titles = await generateGeoTitles({
      businessName: ctx.businessName,
      address: ctx.address,
      targets: weakIdx.map((i) => ({ question: slots[i].topic, keyword: slots[i].keyword })),
    })
    weakIdx.forEach((i, k) => { if (titles[k]) slots[i].label = titles[k] })
  }

  // 5) 최종 안전망 — 어떤 경로(약점 슬롯·월간 추천)로 만들어졌든, 라벨이 여전히
  //    '키워드 나열'(예: "울산 청소업체 추천")이면 결정적 카피 제목으로 교정한다.
  //    계획은 월 1회 고정 저장되므로 여기서 맨 키워드가 새어나가면 한 달간 박힌다.
  slots.forEach((s, i) => {
    if (isKeywordishTitle(s.label, s.topic)) {
      s.label = keywordToCopyTitle({ question: s.topic, keyword: s.keyword }, i)
    }
  })

  return { month: ctx.month, slots }
}

// 이번 달 고정 계획을 반환한다. 없거나 지난달 것이면 새로 만들어 저장(이후 불변).
export async function getOrCreatePostPlan(db: Db, businessId: string, ctx: PlanContext): Promise<PostPlan> {
  const { data } = (await db
    .from('businesses')
    .select('post_plan, post_plan_month' as never)
    .eq('id', businessId)
    .maybeSingle()) as unknown as { data: { post_plan: PostPlan | null; post_plan_month: string | null } | null }

  if (
    data?.post_plan_month === ctx.month &&
    data.post_plan &&
    Array.isArray(data.post_plan.slots) &&
    data.post_plan.slots.length > 0
  ) {
    return data.post_plan
  }

  const plan = await buildMonthlyPlan(db, businessId, ctx)
  await db
    .from('businesses')
    .update({ post_plan: plan, post_plan_month: ctx.month } as never)
    .eq('id', businessId)
  return plan
}

// 오늘(KST) 발행해야 할 계획 슬롯을 고른다. 오늘 슬롯이 있으면 그것, 없으면
// '지나갔지만 아직 발행 안 된' 가장 이른 슬롯(누락 보충), 그것도 없으면 null.
export function pickTodayPlanSlot(plan: PostPlan | null, today: number, publishedDays: Set<number>): PlanSlot | null {
  if (!plan) return null
  const today0 = plan.slots.find((s) => s.day === today && !publishedDays.has(s.day))
  if (today0) return today0
  const overdue = plan.slots
    .filter((s) => s.day <= today && !publishedDays.has(s.day))
    .sort((a, b) => a.day - b.day)
  return overdue[0] ?? null
}
