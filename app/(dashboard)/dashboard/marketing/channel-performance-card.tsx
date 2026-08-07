import { createServiceClient } from '@/lib/supabase/server'
import { ALL_CHANNELS, channelLabel } from '@/lib/utils/marketing-channels'

interface ChannelPerformanceCardProps {
  businessId: string
  // 집계 기간(개월) — 상단 선택기에서 전달 (1/3/6). MarketingStats와 같은 창을 공유
  months: number
}

// 채널별 성과 — "채널 → 문의 → 예약 → 매출"을 한 표로.
// 방문(page_views.channel)까지만 잡던 걸 오더까지 확장해, 어느 홍보 채널이 실제 매출을 만들었는지 보여준다.
// 문의 = 견적(quotes) + 상담리드(leads), 예약·매출 = 견적에서 이어진 예약(booking.channel 승계).
// 채널이 안 붙는 유입(전화·소개·직접 등록)은 '직접·기타'로 묶는다.

const DIRECT_KEY = '' // 채널 미상 — 전화·소개·사장님 직접 등록 등
const REVENUE_STATUSES = ['confirmed', 'in_progress', 'completed']

// 이모지 조회 (없으면 기본 태그 아이콘)
const emojiOf = (key: string): string =>
  key === DIRECT_KEY ? '🏷️' : ALL_CHANNELS.find((c) => c.key === key)?.emoji ?? '🏷️'

interface Agg {
  inquiries: number // 문의 건수 (견적 + 상담리드)
  bookings: number // 예약 건수 (매출 유효 상태)
  revenue: number // 매출 합계
}

export async function ChannelPerformanceCard({ businessId, months }: ChannelPerformanceCardProps) {
  const db = createServiceClient()

  const now = new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString()

  const [quotesResult, leadsResult, bookingsResult] = await Promise.all([
    // 견적 문의 — 테스트 견적 제외용 is_test, 채널 집계용 channel
    db
      .from('quotes')
      .select('id, is_test, channel' as never)
      .eq('business_id', businessId)
      .gte('created_at', periodStart) as unknown as Promise<{
        data: { id: string; is_test: boolean | null; channel: string | null }[] | null
      }>,

    // 상담 리드 문의 — 채널
    db
      .from('leads')
      .select('channel, created_at' as never)
      .eq('business_id', businessId)
      .gte('created_at', periodStart) as unknown as Promise<{
        data: { channel: string | null; created_at: string }[] | null
      }>,

    // 예약 — 매출·건수(채널 승계). 삭제 제외, 테스트 견적 경유분 제외용 quote_id
    db
      .from('bookings')
      .select('final_price, status, channel, quote_id' as never)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('created_at', periodStart) as unknown as Promise<{
        data: { final_price: number | null; status: string; channel: string | null; quote_id: string | null }[] | null
      }>,
  ])

  const quoteRows = quotesResult.data ?? []
  const leadRows = leadsResult.data ?? []
  const bookingRows = bookingsResult.data ?? []

  // 테스트/장난 견적은 통계에서 제외 — 사장님 본인 테스트가 채널 성과를 오염시키지 않게
  const testQuoteIds = new Set(quoteRows.filter((q) => q.is_test).map((q) => q.id))

  const byChannel = new Map<string, Agg>()
  const bump = (key: string, patch: Partial<Agg>) => {
    const cur = byChannel.get(key) ?? { inquiries: 0, bookings: 0, revenue: 0 }
    byChannel.set(key, {
      inquiries: cur.inquiries + (patch.inquiries ?? 0),
      bookings: cur.bookings + (patch.bookings ?? 0),
      revenue: cur.revenue + (patch.revenue ?? 0),
    })
  }

  // 문의 = 견적(테스트 제외) + 상담 리드
  for (const q of quoteRows) {
    if (q.is_test) continue
    bump(q.channel ?? DIRECT_KEY, { inquiries: 1 })
  }
  for (const l of leadRows) {
    bump(l.channel ?? DIRECT_KEY, { inquiries: 1 })
  }

  // 예약·매출 = 매출 유효 상태 예약(테스트 견적 경유분 제외)
  for (const b of bookingRows) {
    if (b.quote_id && testQuoteIds.has(b.quote_id)) continue
    if (!REVENUE_STATUSES.includes(b.status)) continue
    bump(b.channel ?? DIRECT_KEY, { bookings: 1, revenue: b.final_price ?? 0 })
  }

  // 활동 있는 채널만, 매출 → 문의 순으로 정렬
  const rows = Array.from(byChannel.entries())
    .filter(([, a]) => a.inquiries > 0 || a.bookings > 0)
    .sort((x, y) => y[1].revenue - x[1].revenue || y[1].inquiries - x[1].inquiries)

  const hasChannelData = rows.some(([key]) => key !== DIRECT_KEY)

  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">채널별 성과</h3>
        <span className="text-xs text-muted-foreground">최근 {months}개월</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        어느 홍보 채널에서 문의·예약·매출이 나왔는지 한눈에 보고, 힘쓸 곳을 정하세요
      </p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center space-y-1">
          <p className="text-sm text-muted-foreground">아직 채널별로 잡힌 문의가 없어요</p>
          <p className="text-xs text-muted-foreground">
            위 &lsquo;채널별 홍보 링크&rsquo;를 복사해 유튜브·블로그·제안서 QR에 붙이면 여기에 채널별 성과가 쌓여요
          </p>
        </div>
      ) : (
        <>
          {/* 헤더 */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 pb-2 text-[11px] font-medium text-muted-foreground">
            <span>채널</span>
            <span className="w-14 text-right">문의</span>
            <span className="w-14 text-right">예약</span>
            <span className="w-24 text-right">매출</span>
          </div>

          <div className="space-y-2">
            {rows.map(([key, a]) => {
              const convRate = a.inquiries > 0 ? Math.round((a.bookings / a.inquiries) * 100) : null
              return (
                <div
                  key={key || 'direct'}
                  className="rounded-lg border bg-muted/20 px-3 py-2.5 sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-3"
                >
                  {/* 채널명 */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{emojiOf(key)}</span>
                    <span className="text-sm font-medium truncate">{channelLabel(key === DIRECT_KEY ? null : key)}</span>
                    {convRate !== null && a.bookings > 0 && (
                      <span className="shrink-0 text-[10px] font-semibold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">
                        전환 {convRate}%
                      </span>
                    )}
                  </div>

                  {/* 모바일: 3개 지표를 한 줄로 / 데스크탑: 각 칼럼 */}
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:mt-0 sm:contents">
                    <div className="text-center sm:w-14 sm:text-right">
                      <p className="text-sm font-bold tabular-nums">{a.inquiries}</p>
                      <p className="text-[10px] text-muted-foreground sm:hidden">문의</p>
                    </div>
                    <div className="text-center sm:w-14 sm:text-right">
                      <p className={`text-sm font-bold tabular-nums ${a.bookings > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{a.bookings}</p>
                      <p className="text-[10px] text-muted-foreground sm:hidden">예약</p>
                    </div>
                    <div className="text-center sm:w-24 sm:text-right">
                      <p className="text-sm font-bold tabular-nums">
                        {a.revenue > 0 ? `${a.revenue.toLocaleString('ko-KR')}원` : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground sm:hidden">매출</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
            {hasChannelData
              ? "'직접·기타'는 채널 링크 없이 들어온 문의예요 — 전화·소개·직접 등록 등. 채널별 링크를 더 많이 쓸수록 정확해져요."
              : "아직 채널 링크로 들어온 문의가 없어요. 위 '채널별 홍보 링크'를 붙이면 채널이 구분돼 쌓여요."}
          </p>
        </>
      )}
    </div>
  )
}
