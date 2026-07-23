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

export async function GeoShareCard({ businessId }: { businessId: string }) {
  const db = createServiceClient()
  const measureEnabled = !!process.env.PERPLEXITY_API_KEY

  // 최신 2건 — 추세(직전 대비) 계산용
  const { data } = (await db
    .from('geo_checks' as never)
    .select('checked_at, total, cited, share_pct, detail' as never)
    .eq('business_id' as never, businessId)
    .order('checked_at' as never, { ascending: false })
    .limit(2)) as unknown as { data: GeoCheckRow[] | null }

  const checks = data ?? []
  const latest = checks[0] ?? null
  const prev = checks[1] ?? null

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

      {/* 아직 안 잡히는 질문 — 다음 행동 안내 */}
      {missing.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-4">
          <p className="text-sm font-semibold text-amber-900">아직 안 잡히는 질문</p>
          <ul className="mt-2 space-y-1">
            {missing.map((q) => (
              <li key={q} className="text-sm text-amber-900/80">· {q}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-900/70 mt-3">
            이 주제로 홍보 글을 발행하면 다음 측정 때 노출이 올라가요. 자동 발행이 매일 글을 쌓고 있어요.
          </p>
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
