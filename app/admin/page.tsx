import { getAdminMetrics } from '@/lib/admin/metrics'
import { formatMoney } from '@/lib/format/money'
import { formatDateTime } from '@/lib/format/datetime'

// 항상 최신 운영 데이터를 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

// ── 작은 표시용 컴포넌트들 ──────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border bg-background p-4 ${accent ? 'border-emerald-200 bg-emerald-50/40' : ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default async function AdminMetricsPage() {
  const m = await getAdminMetrics()

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">통합 지표 대시보드</h1>
        <span className="text-xs text-muted-foreground">
          기준 {formatDateTime(m.generatedAt, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* 매출 — 밸류에이션 출발점. 가장 위로 */}
      <Section title="💰 매출 (밸류에이션 핵심)" hint="ARR × 멀티플의 출발점. 투자·M&A 1순위 지표">
        <Stat label="MRR (월 반복 매출)" value={formatMoney(m.revenue.mrr)} accent />
        <Stat label="ARR (연 환산)" value={formatMoney(m.revenue.arr)} accent />
        <Stat label="유료 업체" value={`${m.revenue.payingBusinesses}곳`} />
        <Stat label="ARPA (업체당 월매출)" value={formatMoney(m.revenue.arpa)} />
        {m.revenue.planBreakdown.map((p) => (
          <Stat
            key={p.plan}
            label={`${p.label} 플랜`}
            value={`${p.count}곳`}
            sub={`MRR ${formatMoney(p.mrr)}`}
          />
        ))}
      </Section>

      {/* 리텐션 — 멀티플 결정 */}
      <Section title="🔁 리텐션 (멀티플 결정)" hint="전환·이탈. 낮은 churn이 밸류에이션을 끌어올린다">
        <Stat label="무료→유료 전환율" value={pct(m.retention.freeToPaidRate)} accent />
        <Stat label="해지 업체 수" value={`${m.retention.canceledCount}곳`} />
        <Stat label="이탈률 (Churn)" value={pct(m.retention.churnRate)} sub="해지 / (유료+해지)" />
      </Section>

      {/* GMV — 임베디드 결제(핀테크) 가치 기반 */}
      <Section title="💳 GMV·거래 (결제망 가치)" hint="플랫폼을 통과하는 거래액. 향후 결제 take-rate의 기반">
        <Stat label="누적 거래액 (완료)" value={formatMoney(m.gmv.realizedGmv)} accent />
        <Stat label="이번 달 거래액" value={formatMoney(m.gmv.gmvThisMonth)} />
        <Stat label="평균 객단가" value={formatMoney(m.gmv.avgDealSize)} />
        <Stat label="완료 예약" value={`${m.gmv.completedBookings}건`} sub={`전체 ${m.gmv.totalBookings}건`} />
        <Stat label="정기계약 (활성)" value={`${m.gmv.activeContracts}건`} />
        <Stat label="정기계약 월매출" value={formatMoney(m.gmv.contractMrr)} sub="월 환산" />
      </Section>

      {/* 성장 — 퍼널 최상단 */}
      <Section title="📈 성장 (가입·활성화)" hint="퍼널 최상단. 콘텐츠/영업 유입의 결과">
        <Stat label="총 가입 업체" value={`${m.growth.totalBusinesses}곳`} />
        <Stat label="이번 달 신규" value={`+${m.growth.newBusinessesThisMonth}곳`} />
        <Stat label="활성 업체" value={`${m.growth.activeBusinesses}곳`} sub="견적·고객 보유" />
        <Stat label="활성화율" value={pct(m.growth.activationRate)} />
      </Section>

      {/* B2B 파이프라인 — 영업 자산 */}
      <Section title="🏢 B2B 파이프라인 (영업 자산)" hint="타겟이 법인 거래처. 영업 파이프라인이 핵심 가치">
        <Stat label="총 리드" value={`${m.pipeline.totalLeads}건`} />
        <Stat label="법인 비중" value={pct(m.pipeline.corporateLeadRate)} />
        <Stat label="진행 중 예상매출" value={formatMoney(m.pipeline.openPipelineValue)} sub="월 예산 합" />
        {m.pipeline.statusBreakdown.slice(0, 4).map((s) => (
          <Stat key={s.status} label={`리드 · ${s.status}`} value={`${s.count}건`} />
        ))}
      </Section>

      <p className="mt-6 rounded-lg border border-dashed bg-background p-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">M&amp;A 데이터 안내</strong> · 이 지표들은 실사에서 인수자/투자자가 보는 항목입니다.
        다음 단계로 누적할 데이터: <strong>NRR(순매출유지율)</strong>·<strong>코호트 리텐션</strong>은 월별 스냅샷이 쌓여야 계산되므로,
        가입 후 매출 추적이 누적되면 추가합니다. <strong>결제 GMV·할부 전환율</strong>은 토스 결제가 라이브되면 이 화면에 연결됩니다.
      </p>
    </div>
  )
}
