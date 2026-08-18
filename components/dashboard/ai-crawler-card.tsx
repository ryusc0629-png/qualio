import { createServiceClient } from '@/lib/supabase/server'
import { CRAWLER_LABELS, kstToday, type CrawlerBot } from '@/lib/geo/crawler'

// "AI가 우리 글을 읽어간 횟수" 카드.
//
// 왜 이 숫자를 보여주나: AI 검색 답변에 인용되려면 먼저 크롤러가 우리 글을 읽어가야 한다.
// 노출률(인용됐는가)은 몇 주씩 0에 머무를 수 있어 사장님이 먼저 지친다. 반면 크롤러 방문은
// 글을 쓰는 만큼 그전부터 쌓이므로, "되고 있다"를 매주 눈으로 확인할 수 있는 선행 지표가 된다.
// 지어낸 숫자가 아니라 우리 서버에 실제로 찍힌 요청을 센 것이다.

interface HitRow {
  bot: string
  hit_date: string
  hits: number
}

// KST 기준으로 N일 전 날짜 문자열
function kstDaysAgo(days: number): string {
  const base = new Date(Date.now() + 9 * 60 * 60 * 1000)
  base.setUTCDate(base.getUTCDate() - days)
  return base.toISOString().slice(0, 10)
}

// 막대 그래프 — 최근 14일. 값이 0인 날도 자리를 지켜 '쌓이는 중'이 보이게 한다.
function Bars({ days }: { days: { date: string; hits: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.hits))
  return (
    <div className="flex items-end gap-1 h-20" role="img" aria-label="최근 2주 AI 크롤러 방문">
      {days.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col justify-end h-full" title={`${d.date} · ${d.hits}회`}>
          <div
            className={`rounded-t ${d.hits > 0 ? 'bg-emerald-500' : 'bg-slate-100'}`}
            style={{ height: `${d.hits > 0 ? Math.max(8, (d.hits / max) * 100) : 4}%` }}
          />
        </div>
      ))}
    </div>
  )
}

export async function AiCrawlerCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()

  const since = kstDaysAgo(27) // 최근 4주
  const { data } = (await db
    .from('ai_crawler_hits' as never)
    .select('bot, hit_date, hits' as never)
    .eq('business_id' as never, businessId)
    .gte('hit_date' as never, since)
    .order('hit_date' as never, { ascending: true })) as unknown as { data: HitRow[] | null }

  const rows = data ?? []
  const total = rows.reduce((sum, r) => sum + r.hits, 0)

  // ── 아직 한 번도 안 왔을 때 ──
  if (total === 0) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <p className="font-semibold text-sm">🤖 AI가 우리 글을 읽어간 횟수</p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          ChatGPT·Perplexity 같은 AI는 답변에 쓸 자료를 모으려고 홈페이지를 직접 읽어갑니다.
          아직 다녀간 기록이 없어요. <b>글이 쌓이고 검색엔진에 등록되면</b> 여기부터 숫자가 오르기 시작해요.
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          AI 검색에 우리가 나오려면 먼저 읽어가야 해요. 그래서 이 숫자가 노출률보다 먼저 움직입니다.
        </p>
      </div>
    )
  }

  const weekAgo = kstDaysAgo(6)
  const twoWeeksAgo = kstDaysAgo(13)
  const thisWeek = rows.filter((r) => r.hit_date >= weekAgo).reduce((s, r) => s + r.hits, 0)
  const lastWeek = rows
    .filter((r) => r.hit_date >= twoWeeksAgo && r.hit_date < weekAgo)
    .reduce((s, r) => s + r.hits, 0)
  const delta = thisWeek - lastWeek

  // 봇별 합계(많은 순)
  const byBot = new Map<string, number>()
  for (const r of rows) byBot.set(r.bot, (byBot.get(r.bot) ?? 0) + r.hits)
  const bots = [...byBot.entries()].sort((a, b) => b[1] - a[1])

  // 최근 14일 일별(빈 날은 0으로 채움)
  const byDate = new Map<string, number>()
  for (const r of rows) byDate.set(r.hit_date, (byDate.get(r.hit_date) ?? 0) + r.hits)
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = kstDaysAgo(13 - i)
    return { date, hits: byDate.get(date) ?? 0 }
  })

  const today = byDate.get(kstToday()) ?? 0

  return (
    <div className="rounded-xl border bg-white p-6 space-y-4">
      <div>
        <p className="font-semibold text-sm">🤖 AI가 우리 글을 읽어간 횟수</p>
        <p className="text-xs text-muted-foreground mt-1">최근 4주 · 우리 서버에 실제로 찍힌 방문이에요</p>
      </div>

      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold text-emerald-600">{total.toLocaleString()}</span>
        <span className="mb-1 text-sm text-muted-foreground">회</span>
        {lastWeek > 0 && (
          <span
            className={`mb-1 text-sm font-semibold ${
              delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-slate-500' : 'text-muted-foreground'
            }`}
          >
            {delta > 0 ? `▲ 지난주보다 ${delta.toLocaleString()}회 늘었어요` : delta < 0 ? `▼ ${Math.abs(delta).toLocaleString()}회` : '지난주와 같음'}
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground -mt-1">
        이번 주 <b className="text-foreground">{thisWeek.toLocaleString()}회</b>
        {today > 0 && <> · 오늘만 <b className="text-foreground">{today.toLocaleString()}회</b></>}
      </p>

      <Bars days={days} />
      <div className="flex justify-between text-xs text-muted-foreground -mt-2">
        <span>2주 전</span>
        <span>오늘</span>
      </div>

      {/* 어느 AI가 읽어갔나 */}
      <div className="border-t pt-3 space-y-1.5">
        {bots.map(([bot, hits]) => (
          <div key={bot} className="flex items-center justify-between text-sm">
            <span className="text-foreground/80">{CRAWLER_LABELS[bot as CrawlerBot] ?? bot}</span>
            <span className="text-muted-foreground tabular-nums">{hits.toLocaleString()}회</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed border-t pt-3">
        AI 검색 답변에 우리가 나오려면 <b>먼저 읽어가야</b> 해요. 그래서 이 숫자가 노출률보다 먼저 움직입니다.
        글을 쓸수록 읽어가는 횟수가 늘고, 그다음에 노출률이 따라 올라와요.
      </p>
    </div>
  )
}
