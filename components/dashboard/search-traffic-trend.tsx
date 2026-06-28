import { createServiceClient } from '@/lib/supabase/server'
import { isAiSource } from '@/lib/utils/detect-view-source'

// "GEO가 먹히는지"를 시간축으로 증명하는 카드.
// 검색·AI로 들어온 방문이 달이 갈수록 느는지(=글을 낼수록 검색·AI 노출이 쌓이는 플라이휠)를 보여준다.
// marketing-stats의 6개월 '합산' 스냅샷과 달리 이 카드는 '추이'에 집중한다.

interface Props {
  businessId: string
}

// 일반 검색(SEO) 소스 — 네이버·구글·다음
const SEARCH_SOURCES = ['google', 'naver', 'daum']

function isSearchOrAi(source: string): boolean {
  return isAiSource(source) || SEARCH_SOURCES.includes(source)
}

export async function SearchTrafficTrend({ businessId }: Props) {
  const db = createServiceClient()

  const now = new Date()
  const sixMonthsAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
  ).toISOString()

  const [postViewsResult, pageViewsResult, postsResult] = await Promise.all([
    // 블로그 글 조회 (소스 + 시각)
    db
      .from('post_views')
      .select('source, viewed_at')
      .eq('business_id', businessId)
      .gte('viewed_at', sixMonthsAgo),

    // 공개 페이지(견적·브랜드 홈) 방문 — 타입 미반영이라 단언 사용
    db
      .from('page_views' as never)
      .select('source, viewed_at' as never)
      .eq('business_id' as never, businessId)
      .gte('viewed_at' as never, sixMonthsAgo) as unknown as Promise<{
        data: { source: string; viewed_at: string }[] | null
      }>,

    // 월별 발행 글 수 (검색·AI 유입과 상관 비교용)
    db
      .from('biz_posts' as never)
      .select('published_at' as never)
      .eq('business_id' as never, businessId)
      .eq('published' as never, true)
      .gte('published_at' as never, sixMonthsAgo) as unknown as Promise<{
        data: { published_at: string | null }[] | null
      }>,
  ])

  const postViews = postViewsResult.data ?? []
  const pageViews = pageViewsResult.data ?? []
  const posts = postsResult.data ?? []

  // 최근 6개월 버킷 구성 ('YYYY-MM')
  const months: { key: string; label: string; searchAi: number; published: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push({
      key: d.toISOString().slice(0, 7),
      label: `${d.getUTCMonth() + 1}월`,
      searchAi: 0,
      published: 0,
    })
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]))

  // 검색·AI 방문을 월별로 집계 (블로그 + 공개 페이지 합산)
  const allViews = [
    ...postViews.map((v) => ({ source: v.source, at: v.viewed_at })),
    ...pageViews.map((v) => ({ source: v.source, at: v.viewed_at })),
  ]
  for (const v of allViews) {
    if (!v.at || !isSearchOrAi(v.source)) continue
    const idx = monthIndex.get(v.at.slice(0, 7))
    if (idx !== undefined) months[idx].searchAi++
  }

  // 월별 발행 글 수
  for (const p of posts) {
    if (!p.published_at) continue
    const idx = monthIndex.get(p.published_at.slice(0, 7))
    if (idx !== undefined) months[idx].published++
  }

  const totalSearchAi = months.reduce((s, m) => s + m.searchAi, 0)
  const maxBar = months.reduce((m, x) => Math.max(m, x.searchAi), 0)

  // 증감 판정 — 최근 3개월 vs 이전 3개월
  const firstHalf = months.slice(0, 3).reduce((s, m) => s + m.searchAi, 0)
  const secondHalf = months.slice(3).reduce((s, m) => s + m.searchAi, 0)
  const growing = totalSearchAi > 0 && secondHalf > firstHalf

  // 헤드라인 문구 (비테크 사장님 언어)
  let verdict: { text: string; tone: string }
  if (totalSearchAi === 0) {
    verdict = {
      text: '아직 검색·AI로 들어온 방문이 없어요. 글이 검색·AI에 색인되면 여기에 쌓여요',
      tone: 'text-muted-foreground',
    }
  } else if (growing) {
    verdict = {
      text: '검색·AI로 찾아오는 고객이 늘고 있어요 ↗ 글이 쌓일수록 효과가 커져요',
      tone: 'text-emerald-600',
    }
  } else {
    verdict = {
      text: '검색·AI 유입이 꾸준히 쌓이는 중이에요. 글을 더 낼수록 빨라져요',
      tone: 'text-muted-foreground',
    }
  }

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
        <p className="font-semibold text-sm">검색·AI 유입 추이</p>
        <p className="text-xs text-muted-foreground">월별 · 최근 6개월</p>
      </div>

      <div className="p-4 space-y-3">
        {/* 헤드라인 판정 */}
        <p className={`text-xs font-medium ${verdict.tone}`}>{verdict.text}</p>

        {/* 월별 막대 — 검색·AI 방문 수 + 그 달 발행 글 수 보조 표기 */}
        <div className="flex items-end justify-between gap-2 pt-1">
          {months.map((m) => {
            const heightPct = maxBar > 0 ? Math.max((m.searchAi / maxBar) * 100, m.searchAi > 0 ? 8 : 0) : 0
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-bold tabular-nums text-foreground">
                  {m.searchAi > 0 ? m.searchAi.toLocaleString() : ''}
                </span>
                <div className="w-full h-24 flex items-end">
                  <div
                    className="w-full rounded-t bg-emerald-500/80 transition-all min-h-0"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">{m.label}</span>
                {/* 그 달 발행 글 수 — 상관관계(글↑ → 유입↑) 확인용 */}
                <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                  {m.published > 0 ? `글 ${m.published}` : '·'}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-muted-foreground/70 pt-1 border-t">
          막대는 그 달 검색·AI로 들어온 방문, 아래 숫자는 그 달 발행한 글 수예요
        </p>
      </div>
    </div>
  )
}
