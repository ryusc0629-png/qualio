import { createServiceClient } from '@/lib/supabase/server'
import { GeoMeasureButton } from './geo-measure-button'
import { GeoWeakQuestions } from './geo-topic-button'

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

  // 아직 안 잡히는 질문(노출 실패) — 이 질문들로 글을 쓰면 노출이 오른다(행동 유도)
  const missing = latest.detail.filter((d) => !d.mentioned).map((d) => d.query).slice(0, 5)

  // 이 질문들에서 자주 보이는 경쟁 채널 — 우리 도메인은 제외하고 빈도순 상위 3개
  const domainCount = new Map<string, number>()
  for (const d of latest.detail) {
    for (const dom of d.topDomains) {
      if (!dom || dom === APP_HOST) continue
      domainCount.set(dom, (domainCount.get(dom) ?? 0) + 1)
    }
  }
  const topCompetitors = [...domainCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dom]) => dom)

  return (
    <div className="rounded-xl border bg-white p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">🔎 AI 검색 노출률</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatKstDate(latest.checked_at)} 측정 · 손님 질문 {latest.total}개 기준
          </p>
        </div>
        {measureEnabled && <GeoMeasureButton label="다시 측정" />}
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

      {/* 아직 안 잡히는 질문 — 다음 행동 안내 */}
      {missing.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-4">
          <p className="text-sm font-semibold text-amber-900">아직 안 잡히는 질문</p>
          <p className="text-xs text-amber-900/70 mt-1">
            질문 옆 <b>‘글 쓰기’</b>를 누르면 그 주제로 홍보 글이 만들어져요. 글이 쌓이면 다음 측정 때 노출이 올라갑니다.
          </p>
          <GeoWeakQuestions questions={missing} />
        </div>
      )}

      {missing.length === 0 && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
          <p className="text-sm font-semibold text-emerald-900">모든 질문에서 우리 업체가 잡혔어요! 🎉</p>
          <p className="text-xs text-emerald-900/70 mt-1">계속 글을 쌓아 이 자리를 지켜요.</p>
        </div>
      )}

      {/* 경쟁 채널 — 참고 정보 */}
      {topCompetitors.length > 0 && (
        <p className="text-xs text-muted-foreground">
          이 질문들에서 자주 보이는 곳: {topCompetitors.join(', ')}
        </p>
      )}
    </div>
  )
}
