import Link from 'next/link'
import { Phone } from 'lucide-react'
import { getActivationFunnel, type ActivationRow, type Blocker } from '@/lib/admin/onboarding-gaps'
import { formatDate } from '@/lib/format/datetime'

// 연락 대상은 항상 최신으로 본다
export const dynamic = 'force-dynamic'

// 막힌 지점별 표시 — 무엇을 해줘야 하는지까지 적는다.
// 여기서 "전화해서 뭐라고 말할지"가 안 나오면 화면을 봐도 아무 일도 안 일어난다.
const BLOCKER_INFO: Record<Blocker, { label: string; tone: string; action: string }> = {
  'lead-waiting': {
    label: '손님이 기다리는 중',
    tone: 'bg-red-100 text-red-700',
    action: '문의가 들어왔는데 견적이 안 나갔어요. 대신 견적 한 장을 같이 만들어 보낼 것',
  },
  'no-setup': {
    label: '서비스 항목 없음',
    tone: 'bg-amber-100 text-amber-800',
    action: '견적을 만들 수단 자체가 없어요. 통화하면서 서비스 3개만 같이 넣을 것',
  },
  'no-quote': {
    label: '세팅했는데 안 씀',
    tone: 'bg-slate-200 text-slate-700',
    action: '세팅은 끝났어요. 지금 진행 중인 현장 하나로 첫 견적을 같이 보낼 것',
  },
}

/** 마지막으로 화면을 연 때 — 없으면 한 번도 안 들어온 것 */
function lastSeenText(row: ActivationRow): string {
  if (!row.lastActiveAt) return '한 번도 안 들어옴'
  const days = Math.floor((Date.now() - new Date(row.lastActiveAt).getTime()) / 86_400_000)
  if (days === 0) return '오늘 들어옴'
  if (days === 1) return '어제 들어옴'
  return `${days}일째 안 들어옴`
}

/** 퍼널 한 줄 — 단계 이름 · 업체 수 · 가입 대비 비율 막대 */
function Step({ label, count, total, highlight }: { label: string; count: number; total: number; highlight?: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-xs text-muted-foreground sm:w-28">{label}</div>
      <div className="h-7 flex-1 overflow-hidden rounded-md bg-muted">
        <div
          className={`flex h-full items-center justify-end rounded-md px-2 ${
            highlight ? 'bg-red-500' : 'bg-emerald-600'
          }`}
          // 0곳이어도 숫자는 읽혀야 하므로 최소 너비를 준다
          style={{ width: `${Math.max(pct, 12)}%` }}
        >
          <span className="text-xs font-bold text-white">{count}곳</span>
        </div>
      </div>
      <div className="w-10 shrink-0 text-right text-xs text-muted-foreground">{pct}%</div>
    </div>
  )
}

export default async function ActivationFunnelPage() {
  const funnel = await getActivationFunnel()
  const { rows } = funnel
  const waiting = rows.filter((r) => r.blocker === 'lead-waiting')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">견적까지 못 간 곳</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          우리가 세는 건 가입 수가 아니라 <b>첫 견적을 보낸 업체 수</b>예요. 어디서 멈췄는지 보고 그 순서대로 연락해요.
        </p>
      </div>

      {/* 단계별 전환 — 어느 칸에서 사람이 사라지는지 한눈에 */}
      <section className="space-y-2 rounded-xl border bg-background p-4">
        <h2 className="text-sm font-semibold">가입부터 견적까지</h2>
        <div className="space-y-1.5 pt-1">
          <Step label="가입" count={funnel.signedUp} total={funnel.signedUp} />
          <Step label="서비스 등록" count={funnel.withService} total={funnel.signedUp} />
          <Step label="손님 문의 도착" count={funnel.withLead} total={funnel.signedUp} />
          <Step label="견적 발송" count={funnel.withQuote} total={funnel.signedUp} highlight />
          <Step label="예약 잡힘" count={funnel.withBooking} total={funnel.signedUp} />
        </div>
        <p className="pt-1 text-[11px] text-muted-foreground">
          견적 칸이 빨간 이유는 여기가 우리 성적표라서예요. 앞 칸이 아무리 커도 이 칸이 안 오르면 그대로예요.
        </p>
      </section>

      {/* 손님이 기다리는 곳 — 있으면 다른 무엇보다 먼저 */}
      {waiting.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-700">지금 손님이 기다리는 곳 {waiting.length}곳</p>
          <p className="mt-0.5 text-xs text-red-700/80">
            문의가 들어왔는데 견적이 안 나갔어요. 여기부터 전화하면 오늘 계약이 나올 수 있어요.
          </p>
        </div>
      )}

      {/* 연락할 곳 목록 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">연락할 곳 {rows.length}곳</h2>

        {rows.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed bg-background py-12 text-center">
            <p className="text-sm text-muted-foreground">연락할 곳이 없어요</p>
            <p className="text-xs text-muted-foreground">가입한 업체 모두 견적을 한 장 이상 보냈어요</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const info = BLOCKER_INFO[r.blocker]
              return (
                <li key={r.businessId} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <Link
                          href={`/admin/businesses/${r.businessId}`}
                          className="hover:text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                        <span className={`ml-1.5 rounded px-1.5 py-0.5 align-middle text-[11px] font-medium ${info.tone}`}>
                          {info.label}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(r.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })} 가입 ·{' '}
                        {r.daysSinceSignup}일째 · {lastSeenText(r)}
                      </p>
                    </div>
                    {r.phone && (
                      <a
                        href={`tel:${r.phone.replace(/[^0-9]/g, '')}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:border-primary"
                      >
                        <Phone className="h-4 w-4 text-emerald-600" />
                        {r.phone}
                      </a>
                    )}
                  </div>

                  {/* 무엇을 해줘야 하는지 — 전화 걸기 전에 읽을 한 줄 */}
                  <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">{info.action}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>서비스 {r.serviceCount}개</span>
                    <span className={r.leadCount > 0 ? 'font-bold text-red-600' : undefined}>
                      문의 {r.leadCount}건
                    </span>
                    <span>견적 {r.quoteCount}건</span>
                    <span>예약 {r.bookingCount}건</span>
                  </div>

                  {r.missing.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.missing.map((m) => (
                        <span key={m} className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
