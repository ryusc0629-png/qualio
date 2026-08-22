import { createServiceClient } from '@/lib/supabase/server'
import { ALL_CHANNELS, channelLabel } from '@/lib/utils/marketing-channels'
import { contractRevenueSince, type ContractLike } from '@/lib/utils/ltv'
import { isAiSource } from '@/lib/utils/detect-view-source'

interface ChannelPerformanceCardProps {
  businessId: string
  // 집계 기간(개월) — 상단 선택기에서 전달 (1/3/6). MarketingStats와 같은 창을 공유
  months: number
}

// 채널별 성과 — "채널 → 문의 → 예약 → 매출"을 한 표로.
// 방문(page_views.channel)까지만 잡던 걸 오더까지 확장해, 어느 홍보 채널이 실제 매출을 만들었는지 보여준다.
// 문의 = 견적(quotes) + 상담리드(leads).
// 예약·매출 = 유효금액 예약(일회성·견적경유, final_price>0) + 정기계약(월정액×기간).
//   └ 정기 방문 예약은 0원으로 저장되므로 계약 자체를 채널에 귀속해야 매출이 잡힌다.
// 채널이 안 붙는 유입(전화·소개·직접 등록)은 '직접·기타'로 묶는다.

const DIRECT_KEY = '' // 채널 미상 — 소개·사장님 직접 등록 등
// 검색·AI로 들어온 방문은 ?ch= 링크가 아니라 유입 소스(source)로 잡히므로 가짜 채널 키 하나로 묶는다
const SEARCH_KEY = '__search'
const REVENUE_STATUSES = ['confirmed', 'in_progress', 'completed']

// 이모지 조회 (없으면 기본 태그 아이콘)
const emojiOf = (key: string): string =>
  key === SEARCH_KEY ? '🔍' :
  key === DIRECT_KEY ? '🏷️' :
  ALL_CHANNELS.find((c) => c.key === key)?.emoji ?? '🏷️'

const labelOf = (key: string): string =>
  key === SEARCH_KEY ? '검색·AI' : channelLabel(key === DIRECT_KEY ? null : key)

const hintOf = (key: string): string =>
  key === SEARCH_KEY ? '네이버·구글·ChatGPT' :
  key === DIRECT_KEY ? '주소 입력·즐겨찾기·경로 미상' : ''

interface Agg {
  visits: number // 홈페이지·블로그 방문 (익명 — 문의로 이어졌는지는 알 수 없음)
  phoneClicks: number // 전화 버튼 누름 (사람 수 기준 — 같은 사람이 여러 번 눌러도 1)
  inquiries: number // 문의 건수 (견적 + 상담리드)
  bookings: number // 예약 건수 (매출 유효 상태)
  revenue: number // 매출 합계
}

export async function ChannelPerformanceCard({ businessId, months }: ChannelPerformanceCardProps) {
  const db = createServiceClient()

  const now = new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString()

  const [quotesResult, leadsResult, bookingsResult, contractsResult, phoneClicksResult, pageViewsResult, postViewsResult, monthlyPostsResult] = await Promise.all([
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

    // 정기계약 — 계약 매출을 채널에 귀속(방문 예약은 0원이라 계약 자체로 집계). 기간 겹치는 계약만 매출 발생.
    db
      .from('contracts')
      .select('contract_price, start_date, end_date, status, channel, price_history' as never)
      .eq('business_id', businessId) as unknown as Promise<{
        data: (ContractLike & { channel: string | null })[] | null
      }>,

    // 전화 버튼 누름 — 홈페이지·블로그·견적서의 전화 버튼 클릭(익명 세션 기준).
    // 폼을 안 채우고 바로 전화하는 손님이 어느 채널에서 오는지 보여준다.
    db
      .from('quote_funnel_events' as never)
      .select('session_id, channel' as never)
      .eq('business_id' as never, businessId)
      .eq('event_type' as never, 'phone_click')
      .gte('created_at' as never, periodStart) as unknown as Promise<{
        data: { session_id: string; channel: string | null }[] | null
      }>,

    // 공개 페이지 방문 — 채널(?ch=)이 붙는 유일한 방문 기록
    db
      .from('page_views' as never)
      .select('source, channel, viewed_at' as never)
      .eq('business_id' as never, businessId)
      .gte('viewed_at' as never, periodStart) as unknown as Promise<{
        data: { source: string; channel: string | null; viewed_at: string }[] | null
      }>,

    // 블로그 글 방문 — 채널이 없다. 검색·AI로 온 것만 가려내고 나머지는 '직접·기타'로.
    db
      .from('post_views')
      .select('source, viewed_at')
      .eq('business_id', businessId)
      .gte('viewed_at', periodStart),

    // 그 달 발행한 글 수 — 아래 추이 막대에 함께 표시(글이 쌓이는 것과 검색 유입을 나란히 보여준다)
    db
      .from('biz_posts')
      .select('published_at')
      .eq('business_id', businessId)
      .eq('published', true)
      .gte('published_at', periodStart),
  ])

  const quoteRows = quotesResult.data ?? []
  const leadRows = leadsResult.data ?? []
  const bookingRows = bookingsResult.data ?? []
  const contractRows = contractsResult.data ?? []

  // 테스트/장난 견적은 통계에서 제외 — 사장님 본인 테스트가 채널 성과를 오염시키지 않게
  const testQuoteIds = new Set(quoteRows.filter((q) => q.is_test).map((q) => q.id))

  const byChannel = new Map<string, Agg>()
  const bump = (key: string, patch: Partial<Agg>) => {
    const cur = byChannel.get(key) ?? { visits: 0, phoneClicks: 0, inquiries: 0, bookings: 0, revenue: 0 }
    byChannel.set(key, {
      visits: cur.visits + (patch.visits ?? 0),
      phoneClicks: cur.phoneClicks + (patch.phoneClicks ?? 0),
      inquiries: cur.inquiries + (patch.inquiries ?? 0),
      bookings: cur.bookings + (patch.bookings ?? 0),
      revenue: cur.revenue + (patch.revenue ?? 0),
    })
  }

  // 방문 — 예전엔 '어디서 들어오나'라는 별도 상자였다. 방문만 따로 보면 사장님이 할 수 있는 일이 없어
  // (1,000명이 왔다는데 그래서 뭘 하나) 같은 표의 맨 왼쪽 열로 내렸다. 오른쪽 끝 매출이 주인공이다.
  const knownChannelKeys = new Set(ALL_CHANNELS.map((c) => c.key))
  for (const p of pageViewsResult.data ?? []) {
    if (isAiSource(p.source) || ['google', 'naver', 'daum'].includes(p.source)) bump(SEARCH_KEY, { visits: 1 })
    else bump(p.channel && knownChannelKeys.has(p.channel) ? p.channel : DIRECT_KEY, { visits: 1 })
  }
  for (const v of (postViewsResult.data ?? []) as { source: string; viewed_at: string }[]) {
    const searched = isAiSource(v.source) || ['google', 'naver', 'daum'].includes(v.source)
    bump(searched ? SEARCH_KEY : DIRECT_KEY, { visits: 1 })
  }

  // 검색으로 온 손님의 월별 추이 + 그 달 발행한 글 수 — "글을 쓰면 손님이 는다"를 눈으로 보여준다
  const monthlyPosts = (monthlyPostsResult.data ?? []) as { published_at: string }[]
  const postsByMonth = monthlyPosts.reduce<Record<string, number>>((acc, p) => {
    const m = p.published_at.slice(0, 7)
    acc[m] = (acc[m] ?? 0) + 1
    return acc
  }, {})
  const trendBuckets: { label: string; searched: number; published: number }[] = []
  const trendIndex = new Map<string, number>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    trendIndex.set(key, trendBuckets.length)
    trendBuckets.push({ label: `${d.getUTCMonth() + 1}월`, searched: 0, published: postsByMonth[key] ?? 0 })
  }
  const tallyTrend = (source: string, at: string | null) => {
    if (!at) return
    if (!isAiSource(source) && !['google', 'naver', 'daum'].includes(source)) return
    const idx = trendIndex.get(at.slice(0, 7))
    if (idx !== undefined) trendBuckets[idx].searched++
  }
  for (const p of pageViewsResult.data ?? []) tallyTrend(p.source, p.viewed_at)
  for (const v of (postViewsResult.data ?? []) as { source: string; viewed_at: string }[]) tallyTrend(v.source, v.viewed_at)
  const trendMax = trendBuckets.reduce((m, x) => Math.max(m, x.searched), 0)

  // 전화 버튼 누름 — 같은 사람이 여러 번 눌러도 1명으로 센다(연타로 부풀지 않게)
  const phoneSessionsByChannel = new Map<string, Set<string>>()
  for (const e of phoneClicksResult.data ?? []) {
    const key = e.channel ?? DIRECT_KEY
    const set = phoneSessionsByChannel.get(key) ?? new Set<string>()
    set.add(e.session_id)
    phoneSessionsByChannel.set(key, set)
  }
  for (const [key, set] of phoneSessionsByChannel) bump(key, { phoneClicks: set.size })
  const totalPhoneClicks = Array.from(phoneSessionsByChannel.values()).reduce((s, set) => s + set.size, 0)

  // 문의 = 견적(테스트 제외) + 상담 리드
  for (const q of quoteRows) {
    if (q.is_test) continue
    bump(q.channel ?? DIRECT_KEY, { inquiries: 1 })
  }
  for (const l of leadRows) {
    bump(l.channel ?? DIRECT_KEY, { inquiries: 1 })
  }

  // 예약·매출(일회성) = 매출 유효 상태 + 금액 있는 예약(테스트 견적 경유분 제외).
  // final_price>0 조건으로 0원 정기 방문 예약은 제외 — 정기 매출은 아래 계약에서 따로 집계(이중계상 방지).
  for (const b of bookingRows) {
    if (b.quote_id && testQuoteIds.has(b.quote_id)) continue
    if (!REVENUE_STATUSES.includes(b.status)) continue
    if ((b.final_price ?? 0) <= 0) continue
    bump(b.channel ?? DIRECT_KEY, { bookings: 1, revenue: b.final_price ?? 0 })
  }

  // 정기계약 = 계약 1건을 예약 1로 세고, 이 기간에 발생한 월정액 매출(월×개월)을 채널에 귀속
  for (const c of contractRows) {
    const rev = contractRevenueSince([c as ContractLike], periodStart)
    if (rev <= 0) continue // 이 기간에 매출이 없는(아직 시작 전·이미 종료된) 계약은 제외
    bump(c.channel ?? DIRECT_KEY, { bookings: 1, revenue: rev })
  }

  // 표에는 '돈이 된 줄'만 올린다.
  // ⚠️ 방문까지 표의 한 열로 넣어봤더니 열 줄 중 여덟 줄이 문의·계약·매출 전부 '—'가 됐다.
  //    방문은 링크로 자동으로 잡히지만 문의·매출은 사장님이 유입 경로를 골라야 붙기 때문이다.
  //    빈칸 벽은 "이 채널들 다 꽝"으로 읽힌다 → 방문은 표가 아니라 위쪽 한 줄 요약으로 뺀다.
  const rows = Array.from(byChannel.entries())
    .filter(([, a]) => a.inquiries > 0 || a.bookings > 0 || a.phoneClicks > 0)
    .sort((x, y) => y[1].revenue - x[1].revenue || y[1].inquiries - x[1].inquiries)

  // 방문 요약 — 총 몇 명이 다녀갔고 어느 길이 컸는지. 숫자 하나 + 상위 경로 몇 개면 충분하다.
  const visitRows = Array.from(byChannel.entries())
    .filter(([, a]) => a.visits > 0)
    .sort((x, y) => y[1].visits - x[1].visits)
  const totalVisits = visitRows.reduce((sum, [, a]) => sum + a.visits, 0)
  const topVisitRows = visitRows.slice(0, 4)
  const otherVisits = totalVisits - topVisitRows.reduce((sum, [, a]) => sum + a.visits, 0)

  const hasChannelData = rows.some(([key]) => key !== DIRECT_KEY)

  // ── 북극성: 노출 볼륨이 아니라 계약률(전환)이 성과 ──
  // 방문·문의가 적어도 '계약이 잘 되는' 채널을 맨 위에서 칭찬한다.
  // ⚠️ 소표본 착시(문의 1→계약 1=100%) 방지: 최소 문의 MIN_INQ 이상인 채널만 후보.
  const MIN_INQ = 3
  const bestConverter = rows
    .filter(([key, a]) => key !== DIRECT_KEY && a.inquiries >= MIN_INQ && a.bookings > 0)
    .map(([key, a]) => ({ key, rate: a.bookings / a.inquiries, a }))
    .sort((x, y) => y.rate - x.rate)[0]

  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">어디서 오고, 얼마가 됐나</h3>
        <span className="text-xs text-muted-foreground">최근 {months}개월</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        한 줄씩 왼쪽에서 오른쪽으로 읽어보세요 — 방문이 많은 채널이 아니라 <b>매출이 찍힌 채널</b>에 힘을 몰아주시면 돼요
      </p>

      {/* 방문 — 예전엔 '어디서 들어오나'라는 상자를 따로 갖고 있었다. 방문만 보고 사장님이 할 수 있는 일이
          없어서 상자에서 한 줄로 내렸다. 아래 표(돈이 된 채널)로 넘어가기 전의 맥락 한 줄. */}
      {totalVisits > 0 && (
        <div className="mb-3 rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm">
            👣 이 기간에 <b>{totalVisits.toLocaleString('ko-KR')}명</b>이 홈페이지·홍보 글을 보고 갔어요
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {topVisitRows.map(([key, a]) => `${labelOf(key)} ${a.visits.toLocaleString('ko-KR')}`).join(' · ')}
            {otherVisits > 0 && ` · 그 외 ${otherVisits.toLocaleString('ko-KR')}`}
          </p>
        </div>
      )}

      {/* 전화 버튼 누름 — 아래 표의 '전화 문의' 채널과는 다른 숫자라 표에 넣지 않고 여기 한 줄로만 둔다.
          (표에 '전화' 열로 같이 두었더니 같은 손님이 두 번 세어지는 것처럼 보였다) */}
      {totalPhoneClicks > 0 && (
        <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm">
            📞 이 기간에 <b>{totalPhoneClicks}명</b>이 홈페이지·견적서에서 <b>전화 버튼</b>을 눌렀어요
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            전화를 받으시면 고객 등록 때 &lsquo;어떻게 알고 오셨어요?&rsquo;를 골라주세요. 그래야 아래 표에 매출까지 이어집니다
          </p>
        </div>
      )}

      {/* 계약률 스코어보드 — 방문 적어도 계약 잘 되는 채널을 맨 위에서 칭찬 */}
      {bestConverter && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-[11px] font-medium text-emerald-700">가장 계약이 잘 되는 채널</p>
          <p className="mt-0.5 text-sm text-emerald-900">
            <span className="font-bold">{emojiOf(bestConverter.key)} {channelLabel(bestConverter.key)}</span>
            {' — '}문의 {bestConverter.a.inquiries}명 중 <b>{bestConverter.a.bookings}명 계약</b>
            {' '}<span className="font-bold">(전환 {Math.round(bestConverter.rate * 100)}%)</span>
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center space-y-1">
          <p className="text-sm text-muted-foreground">아직 채널별로 잡힌 문의가 없어요</p>
          <p className="text-xs text-muted-foreground">
            위 &lsquo;채널별 홍보 링크&rsquo;를 복사해 유튜브·블로그·제안서 QR에 붙이면 여기에 채널별 성과가 쌓여요
          </p>
        </div>
      ) : (
        <>
          {/* 헤더 — 방문 → 문의 → 계약 → 매출 순. 왼쪽에서 오른쪽으로 읽으면 그 채널의 이야기가 된다.
              전화 버튼 클릭은 위 안내 한 줄로 뺐다(채널이 아니라 행동이라 열로 두면 중복처럼 읽힘) */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 pb-2 text-[11px] font-medium text-muted-foreground">
            <span>채널</span>
            <span className="w-14 text-right">문의</span>
            <span className="w-16 text-right">예약·계약</span>
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
                    <span className="text-sm font-medium truncate">{labelOf(key)}</span>
                    {hintOf(key) && (
                      <span className="hidden sm:inline shrink-0 text-[10px] text-muted-foreground/70">{hintOf(key)}</span>
                    )}
                    {convRate !== null && a.bookings > 0 && (
                      <span className="shrink-0 text-[10px] font-semibold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">
                        전환 {convRate}%
                      </span>
                    )}
                  </div>

                  {/* 모바일: 3개 지표를 한 줄로 / 데스크탑: 각 칼럼 */}
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:mt-0 sm:contents">
                    <div className="text-center sm:w-14 sm:text-right">
                      {/* 문의 0은 '없었다'가 아니라 '폼을 안 거치고 바로 계약'인 경우가 많아 —로 둔다
                          (전화로 바로 계약한 손님이 '문의 0 · 계약 1'로 보여 고장난 것처럼 읽혔다) */}
                      <p className={`text-sm font-bold tabular-nums ${a.inquiries > 0 ? '' : 'text-muted-foreground'}`}>
                        {a.inquiries > 0 ? a.inquiries : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground sm:hidden">문의</p>
                    </div>
                    <div className="text-center sm:w-16 sm:text-right">
                      <p className={`text-sm font-bold tabular-nums ${a.bookings > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {a.bookings > 0 ? a.bookings : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground sm:hidden">예약·계약</p>
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
            {/* ⚠️ 방문은 많은데 문의가 '—'인 줄을 '그 채널은 꽝'으로 읽으면 안 된다.
                방문은 링크(?ch=)로 자동으로 잡히지만 문의·매출은 사장님이 유입 경로를 골라야 붙는다.
                계측이 빈 것을 성과 0으로 보이게 두지 말 것 */}
            위 방문은 홍보 링크로 자동으로 잡히지만, <b className="text-foreground/70">문의·계약은 고객 등록 때 &lsquo;어떻게 알고 오셨어요?&rsquo;</b>를 골라주셔야 이 표에 붙어요.
            {' '}그래서 방문이 많은 채널이 이 표에 안 보일 수 있어요 — 성과가 없는 게 아니라 아직 연결이 안 된 거예요.
            {!hasChannelData && " 위 '채널별 홍보 링크'를 붙이면 채널이 더 잘게 구분돼요."}
          </p>

        </>
      )}

      {/* 검색 유입 추이 — 별도 상자('어디서 들어오나')에 있던 것을 여기로 합쳤다.
          같은 이야기를 두 상자가 나눠 하고 있었다.
          ⚠️ 표(돈이 된 채널) 안이 아니라 밖에 둔다 — 아직 문의가 한 건도 없는 업체에게
             "글을 쓰면 손님이 는다"를 보여주는 게 이 그래프의 일이라, 그 업체에서 사라지면 안 된다. */}
      {trendBuckets.length >= 2 && (
        <div className="mt-4 border-t pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            💚 광고비 <b className="text-foreground/80">0원</b> —{' '}
            {trendMax === 0
              ? '아직 검색으로 들어온 방문이 없어요. 글이 색인되면 여기에 쌓여요'
              : '글이 쌓일수록 검색으로 찾아오는 손님이 늘어요'}
          </p>
          <div className="flex items-end justify-between gap-2 pt-1">
            {trendBuckets.map((m) => {
              const heightPct = trendMax > 0 ? Math.max((m.searched / trendMax) * 100, m.searched > 0 ? 8 : 0) : 0
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-bold tabular-nums text-foreground">
                    {m.searched > 0 ? m.searched.toLocaleString('ko-KR') : ''}
                  </span>
                  <div className="w-full h-20 flex items-end">
                    <div className="w-full rounded-t bg-emerald-500" style={{ height: `${heightPct}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{m.label}</span>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                    {m.published > 0 ? `글 ${m.published}` : '·'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
