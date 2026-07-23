import { createServiceClient } from '@/lib/supabase/server'
import { GeoMeasureButton } from './geo-measure-button'

// AI 검색 노출률 카드(GEO Phase 1) — 소비자 질문을 AI 검색에 던져 우리 업체가
// 결과에 잡히는 비율을 측정한 결과를 사장님이 숫자로 보게 한다.
// "AI 답변에 인용되려면 먼저 검색 결과에 잡혀야 한다" — 노출률은 GEO의 선행 지표.

interface GeoCheckDetail {
  query: string
  mentioned: boolean
  topDomains: string[]
}

interface GeoCheckRow {
  checked_at: string
  total: number
  cited: number
  share_pct: number
  detail: GeoCheckDetail[]
}

const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')

function formatKstDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

// 노출률 추세 스파크라인 — 측정할 때마다 점이 찍혀 우상향 라인이 그려진다.
// Y축은 0~100% 고정(자동 확대로 상승을 과장하지 않음 — 정직한 추세).
// preserveAspectRatio는 기본값(균일 스케일) 사용 — none은 원/글자를 찌그러뜨림.
function TrendChart({ points }: { points: { pct: number; label: string }[] }) {
  const W = 500
  const H = 150
  const padL = 34 // 좌측 눈금 라벨 공간
  const padR = 16
  const padT = 18
  const padB = 14
  const n = points.length
  const yOf = (pct: number) => H - padB - (Math.max(0, Math.min(100, pct)) / 100) * (H - padT - padB)
  const xy = points.map((p, i) => ({
    x: n === 1 ? (padL + W - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR),
    y: yOf(p.pct),
    pct: p.pct,
  }))
  const line = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${xy[0].x.toFixed(1)},${H - padB} ${line} ${xy[n - 1].x.toFixed(1)},${H - padB}`
  const last = xy[n - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="AI 검색 노출률 추세">
      {/* 기준선 + 좌측 눈금(0·50·100%) */}
      {[0, 50, 100].map((v) => {
        const y = yOf(v)
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f5f9" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              {v}%
            </text>
          </g>
        )
      })}
      {/* 면적 채움 */}
      <polygon points={area} fill="#059669" fillOpacity={0.08} />
      {/* 추세선 */}
      <polyline points={line} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* 각 측정점 */}
      {xy.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === n - 1 ? 4 : 2.5} fill="#059669" />
      ))}
      {/* 마지막 점 값 라벨 */}
      <text x={last.x} y={last.y - 9} textAnchor="middle" fontSize={12} fontWeight={700} fill="#059669">
        {last.pct}%
      </text>
    </svg>
  )
}

export async function GeoShareCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()
  const measureEnabled = !!process.env.PERPLEXITY_API_KEY

  // 최근 12건 — 추세 그래프 + 직전 대비 계산용
  const { data } = (await db
    .from('geo_checks' as never)
    .select('checked_at, total, cited, share_pct, detail' as never)
    .eq('business_id' as never, businessId)
    .order('checked_at' as never, { ascending: false })
    .limit(12)) as unknown as { data: GeoCheckRow[] | null }

  const history = (data ?? []).slice().reverse() // 오래된→최신(그래프 왼→오른)
  const latest = history[history.length - 1] ?? null
  const prev = history[history.length - 2] ?? null

  // ── 아직 측정 전 ──
  if (!latest) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <p className="font-semibold text-sm">🔎 AI 검색에 우리 업체가 얼마나 나올까요?</p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          손님들이 <b>ChatGPT·Perplexity 같은 AI 검색</b>에 “우리 동네 청소업체 추천”이라고 물었을 때,
          우리 업체가 얼마나 나오는지 측정해 드려요. 홍보 글이 쌓일수록 이 숫자가 올라갑니다.
        </p>
        <div className="mt-4">
          {measureEnabled ? (
            <GeoMeasureButton />
          ) : (
            <p className="text-xs text-muted-foreground">노출률 측정 기능을 준비하고 있어요. 곧 열립니다.</p>
          )}
        </div>
      </div>
    )
  }

  // 추세 — 직전 측정 대비 몇 %p 변화
  const delta = prev ? latest.share_pct - prev.share_pct : null

  // 질문별 승패 — 이미 잡힌 질문 / 아직 안 잡힌 질문
  const citedQuestions = latest.detail.filter((d) => d.mentioned)
  const weakQuestions = latest.detail.filter((d) => !d.mentioned)
  // 특정 질문에서 지금 잡히는 경쟁 채널(우리 도메인 제외, 상위 2개)
  const competitorsFor = (topDomains: string[]) =>
    topDomains.filter((d) => d && d !== APP_HOST).slice(0, 2)

  // AI 추천 순위(리더보드) — 각 도메인이 '몇 개 질문'에 등장하는지 집계(질문당 1회).
  // 우리 업체 순위(= cited 수 기준)를 함께 계산해 "이기는 감각"을 준다.
  const domainWins = new Map<string, number>()
  for (const d of latest.detail) {
    const seen = new Set<string>()
    for (const dom of d.topDomains) {
      if (!dom || dom === APP_HOST || seen.has(dom)) continue
      seen.add(dom)
      domainWins.set(dom, (domainWins.get(dom) ?? 0) + 1)
    }
  }
  const competitorRanks = [...domainWins.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  const usCount = latest.cited
  const usRank = competitorRanks.filter((c) => c.count > usCount).length + 1

  return (
    <div className="rounded-xl border bg-white p-6 space-y-5">
      <div>
        <p className="font-semibold text-sm">🔎 AI 검색 노출률</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatKstDate(latest.checked_at)} 측정 · 손님 질문 {latest.total}개 기준
          {measureEnabled && ' · 매주 자동 측정돼요'}
        </p>
      </div>

      {/* 핵심 숫자 */}
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold text-emerald-600">{latest.share_pct}%</span>
        {delta !== null && (
          <span
            className={`mb-1 text-sm font-semibold ${
              delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-muted-foreground'
            }`}
          >
            {delta > 0 ? `▲ ${delta}%p` : delta < 0 ? `▼ ${Math.abs(delta)}%p` : '지난 측정과 같음'}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        손님 질문 <b>{latest.total}개</b> 중 <b className="text-foreground">{latest.cited}개</b>에서
        AI 검색에 우리 업체가 잡혔어요.
      </p>

      {/* 추세 그래프 — 측정이 쌓일수록 우상향 라인 */}
      {history.length >= 2 ? (
        <div>
          <TrendChart points={history.map((c) => ({ pct: c.share_pct, label: formatKstDate(c.checked_at) }))} />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatKstDate(history[0].checked_at)}</span>
            <span>{formatKstDate(latest.checked_at)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground rounded-lg bg-slate-50 border p-3">
          측정을 몇 번 더 하면 여기에 <b>노출률이 올라가는 그래프</b>가 그려져요. 매주 자동으로도 측정됩니다.
        </p>
      )}

      {/* AI 추천 순위(리더보드) — 이 질문들에서 누가 자주 추천되나 + 우리 위치 */}
      {competitorRanks.length > 0 && (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-semibold">
            🏆 AI 추천 순위 <span className="text-xs font-normal text-muted-foreground">(이 질문들 기준)</span>
          </p>
          <ul className="mt-2 space-y-1.5">
            {competitorRanks.slice(0, 5).map((c, i) => (
              <li key={c.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-4 text-center text-xs ${i === 0 ? 'text-amber-500 font-bold' : 'text-muted-foreground'}`}>{i + 1}</span>
                  <span className="truncate text-foreground/80">{c.name}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">{c.count}개 질문</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 pt-2 border-t flex items-center justify-between text-sm font-semibold text-emerald-700">
            <span>우리 업체</span>
            <span className="text-xs">
              {usCount > 0 ? `${usRank}위 · ${usCount}개 질문에서 추천` : '아직 순위 밖 — 글이 쌓이면 올라가요'}
            </span>
          </div>
        </div>
      )}

      {/* 이미 잡히는 질문(승) — 잡힌 것도 있고 아직인 것도 있을 때만 별도 표시 */}
      {citedQuestions.length > 0 && weakQuestions.length > 0 && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
          <p className="text-sm font-semibold text-emerald-900">✅ 이미 AI에 잡히는 질문</p>
          <ul className="mt-2 space-y-1">
            {citedQuestions.map((d) => (
              <li key={d.query} className="text-sm text-emerald-900/80">· {d.query}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 아직 안 잡히는 질문(패) — 질문별로 지금 잡히는 경쟁 채널까지(승패 드릴다운) */}
      {weakQuestions.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-4">
          <p className="text-sm font-semibold text-amber-900">아직 안 잡히는 질문</p>
          <p className="text-xs text-amber-900/70 mt-1">
            자동 발행이 <b>이 질문들부터 우선</b> 글을 씁니다. 글이 쌓이면 다음 측정 때 잡히기 시작해요. (따로 하실 일 없어요)
          </p>
          <ul className="mt-3 space-y-2.5">
            {weakQuestions.map((d) => {
              const comp = competitorsFor(d.topDomains)
              return (
                <li key={d.query} className="text-sm">
                  <p className="text-amber-900/90">· {d.query}</p>
                  <p className="text-xs text-amber-900/60 mt-0.5 pl-2">
                    {comp.length > 0
                      ? `지금 잡히는 곳: ${comp.join(', ')}`
                      : '아직 뚜렷한 업체가 없어요 — 먼저 선점할 기회예요'}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {weakQuestions.length === 0 && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
          <p className="text-sm font-semibold text-emerald-900">모든 질문에서 우리 업체가 잡혔어요! 🎉</p>
          <p className="text-xs text-emerald-900/70 mt-1">계속 글을 쌓아 이 자리를 지켜요.</p>
        </div>
      )}

      {/* 기대치 설명 — 아직 한 건도 안 잡혔을 때(초기 이탈 방지) */}
      {latest.cited === 0 && (
        <div className="rounded-lg bg-slate-50 border p-4">
          <p className="text-sm font-semibold text-foreground">지금 0%인 건 정상이에요</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            AI 검색은 글이 쌓이고 검색엔진에 반영되기까지 보통 <b>2~4주</b>가 걸려요. 이제 막 시작한 단계라 0%가 자연스러워요.
            자동 발행이 위 질문들부터 글을 쓰고 있으니, <b>매주 측정 결과로 조금씩 올라가는 걸</b> 보시게 됩니다.
          </p>
        </div>
      )}
    </div>
  )
}
