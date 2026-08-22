import { createServiceClient } from '@/lib/supabase/server'
import { contractRevenueSince, type ContractLike } from '@/lib/utils/ltv'

interface MarketingStatsProps {
  businessId: string
  // 집계 기간(개월) — 페이지 상단 선택기에서 전달 (1/3/6)
  months: number
}

// 마케팅 성과 — "성적표(매출) → 핵심 레버(전환)" 두 층.
// 유입(방문)은 여기서 다루지 않는다 — 아래 '어디서 오고, 얼마가 됐나'(channel-performance-card)의
// 맨 왼쪽 열로 합쳤다. 방문만 따로 보여주는 상자는 사장님이 보고 할 수 있는 일이 없었다.
// ⛔'어디서 들어오나' 상자를 다시 만들지 말 것.
export async function MarketingStats({ businessId, months }: MarketingStatsProps) {
  const db = createServiceClient()

  const now = new Date()
  // 선택한 기간의 시작(개월 수만큼 이전 달의 1일). 모든 지표가 이 창을 공유한다.
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString()
  const periodLabel = `최근 ${months}개월`

  const [quotesResult, bookingsResult, contractsResult, b2bQuotesResult] = await Promise.all([
    // 견적 신청 (기간 내) — 테스트 견적 제외용으로 id·is_test 조회
    db
      .from('quotes')
      .select('id, is_test' as never)
      .eq('business_id', businessId)
      .gte('created_at', periodStart),

    // 예약 — 현재 매출(전체) + 견적→예약 전환(quote_id 있는 것) 겸용. 삭제 건 제외.
    db
      .from('bookings')
      .select('final_price, status, quote_id')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('created_at', periodStart),

    // 정기계약 — 이 기간에 발생한 계약(정기청소) 매출 집계용. 방문 예약은 0원 저장이라
    // 예약 합계에 안 잡히므로 계약을 따로 더해야 실제 '퀄리오로 만든 매출'이 된다.
    db
      .from('contracts')
      .select('contract_price, start_date, end_date, status, price_history' as never)
      .eq('business_id', businessId),

    // 거래처 견적서·시방서(b2b_quotes) — 잠재고객을 직접 등록하고 사장님이 보낸 문서.
    // 공개 폼(quotes)에는 안 남지만 이것도 퀄리오로 만든 전환이라 아래에서 같은 퍼널에 합산한다.
    db
      .from('b2b_quotes')
      .select('lead_id')
      .eq('business_id', businessId)
      .gte('created_at', periodStart),
  ])

  // ── 성적표: 현재 매출(이 기간 예약 전체) ──
  // 테스트/장난 견적(is_test) 제외 — 사장님 본인 테스트·호기심 클릭이 통계를 오염시키지 않게
  const quoteRows = (quotesResult.data ?? []) as unknown as { id: string; is_test: boolean | null }[]
  const testQuoteIds = new Set(quoteRows.filter((q) => q.is_test).map((q) => q.id))
  const formQuoteCount = quoteRows.filter((q) => !q.is_test).length

  const allBookingRows = (bookingsResult.data ?? []) as { final_price: number | null; status: string; quote_id: string | null }[]
  const bookingRows = allBookingRows.filter((b) => !(b.quote_id && testQuoteIds.has(b.quote_id)))

  // 테스트 견적(사장님 본인 번호로 들어온 견적)에서 이어진 예약은 위에서 빠졌다.
  // 그 금액이 크면 "매출이 왜 이것밖에 안 되지?"가 되므로, 얼마가 빠졌는지 화면에 밝힌다.
  // (실제로 809만원짜리 두 건이 조용히 빠져 있어 숫자가 고장난 것처럼 보였다)
  const excludedTestBookings = allBookingRows.filter(
    (b) => b.quote_id && testQuoteIds.has(b.quote_id) && (b.final_price ?? 0) > 0,
  )
  const excludedTestRevenue = excludedTestBookings.reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  // 견적(문의 폼·견적서)에서 이어진 예약만 — 2층 '견적 → 예약' 전환 퍼널용
  const quoteBookingRows = bookingRows.filter((b) => b.quote_id !== null)
  const formBookingCount = quoteBookingRows.length

  // ── 거래처 견적서도 같은 퍼널에 합산 ──
  // 공개 폼(quotes)만 세면, 잠재고객을 직접 등록해 견적서·시방서를 보내고 계약까지 간 건이
  // 분모·분자 양쪽에서 빠져 전환율이 0%로 보인다. 실제로 한 일을 그대로 세도록 더한다.
  // ⚠️ 견적서 '장수'가 아니라 '거래처 수'로 센다 — 한 거래처에 여러 장(수정 재발송)을 보낼 수 있어
  //    장수로 세면 오히려 공들인 거래처일수록 전환율이 깎인다.
  const b2bLeadIds = Array.from(new Set(
    ((b2bQuotesResult.data ?? []) as { lead_id: string | null }[])
      .map((q) => q.lead_id)
      .filter((id): id is string => Boolean(id))
  ))
  let b2bQuotedCount = 0
  let b2bContractedCount = 0
  if (b2bLeadIds.length > 0) {
    const { data: leadRows } = await db.from('leads').select('id, status').in('id', b2bLeadIds)
    const rows = leadRows ?? []
    b2bQuotedCount = rows.length
    b2bContractedCount = rows.filter((l) => l.status === 'contracted').length
  }

  const quoteCount = formQuoteCount + b2bQuotedCount
  const bookingCount = formBookingCount + b2bContractedCount
  const conversionRate = quoteCount > 0 ? Math.round((bookingCount / quoteCount) * 100) : 0

  // 현재 매출 — 이 기간 예약(확정·진행·완료) 전체. 견적 경유 여부와 무관하게 실제 매출을 보여준다.
  const REVENUE_STATUSES = ['confirmed', 'in_progress', 'completed']
  const revenueBookings = bookingRows.filter((b) => REVENUE_STATUSES.includes(b.status))
  const bookingRevenue = revenueBookings.reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  const completedRevenue = bookingRows
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + (b.final_price ?? 0), 0)
  const upcomingRevenue = bookingRevenue - completedRevenue

  // 정기계약 매출(이 기간분) — 예약 매출과 별개 축. 합쳐야 '퀄리오로 만든 매출' 전체가 된다.
  const contractRows = (contractsResult.data ?? []) as unknown as ContractLike[]
  const contractRevenue = contractRevenueSince(contractRows, periodStart)
  const totalRevenue = bookingRevenue + contractRevenue


  return (
    <div className="space-y-4">
      {/* ── 1층 성적표: 현재 매출(이 기간 예약 전체) ── */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🎉</span>
          <p className="text-sm font-semibold text-emerald-800">퀄리오로 운영하며 만든 매출</p>
          <span className="text-xs text-emerald-600/70">· {periodLabel}</span>
        </div>
        <p className="mt-2 text-3xl font-extrabold text-emerald-700 tracking-tight">
          ₩{totalRevenue.toLocaleString('ko-KR')}
        </p>
        {totalRevenue > 0 ? (
          <>
            <p className="mt-1.5 text-sm text-emerald-900/80">
              이 기간에 만든 <b>예약·정기계약 매출</b>이에요
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {completedRevenue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-white/70 border border-emerald-100 px-2.5 py-1 text-emerald-700">
                  예약 완료 <b>₩{completedRevenue.toLocaleString('ko-KR')}</b>
                </span>
              )}
              {upcomingRevenue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-white/70 border border-emerald-100 px-2.5 py-1 text-emerald-700/80">
                  예약 예정 <b>₩{upcomingRevenue.toLocaleString('ko-KR')}</b>
                </span>
              )}
              {contractRevenue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-emerald-800 font-medium">
                  정기계약 <b>₩{contractRevenue.toLocaleString('ko-KR')}</b>
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-emerald-900/70">
            아직 이 기간에 매출이 없어요. 예약이 확정되거나 정기계약이 잡히면 여기에 매출이 쌓여요.
          </p>
        )}
        {/* 테스트 견적으로 빠진 금액을 밝힌다 — 조용히 빼면 사장님은 숫자가 틀린 줄 안다.
            ⚠️ 지금은 '테스트 표시를 푸는' 화면이 없어서 되돌리는 방법을 안내하지 않는다.
               (없는 방법을 알려주면 사장님이 찾다가 못 찾는다) */}
        {excludedTestRevenue > 0 && (
          <p className="mt-3 rounded-lg bg-white/60 border border-emerald-100 px-3 py-2 text-xs text-emerald-900/80 leading-relaxed">
            사장님 번호로 들어온 <b>견적 {excludedTestBookings.length}건(₩{excludedTestRevenue.toLocaleString('ko-KR')})</b>은 시험용으로 보고 뺐어요
          </p>
        )}
        <p className="mt-3 pt-3 border-t border-emerald-100 text-xs text-emerald-900/60 leading-relaxed">
          이 기간에 잡힌 예약(확정·진행·완료)과 정기계약의 매출 합계예요. 정기계약은 월정액 × 이 기간의 개월 수로 쌓여요. 퀄리오에서 관리하는 실제 매출이에요.
        </p>
      </div>

      {/* ── 2층 핵심 레버: 전환(매일 볼 곳) ── */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm">여기에 집중하세요 — 견적을 계약으로</p>
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="grid grid-cols-3 divide-x">
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold">{quoteCount}</p>
            <p className="text-xs text-muted-foreground mt-1">견적 보냄</p>
          </div>
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold">{bookingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">예약·계약 전환</p>
          </div>
          <div className="px-2 py-5 text-center">
            <p className="text-2xl font-bold text-primary">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">전환율</p>
          </div>
        </div>
        <div className="px-5 py-3 border-t bg-slate-50/50">
          <p className="text-xs text-muted-foreground leading-relaxed">
            방문자를 늘리는 것보다 <b className="text-foreground">이미 만난 고객을 계약으로 바꾸는 것</b>이 매출을 가장 크게 올려요.
            이 전환율을 올리는 데 집중하세요.
          </p>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed mt-1.5">
            홈페이지로 들어온 견적 문의와, 거래처에 직접 보낸 견적서·시방서를 함께 세요.
            거래처는 보낸 장수가 아니라 <b className="text-foreground/70">거래처 수</b>로 세고, 상태를 계약완료로 바꾸면 전환으로 잡혀요.
          </p>
        </div>
      </div>

    </div>
  )
}
