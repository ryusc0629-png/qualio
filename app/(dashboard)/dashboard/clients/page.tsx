import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AddClientForm } from '@/components/dashboard/add-client-form'
import { EditCustomerButton } from '@/components/dashboard/edit-customer-button'
import { DeleteCustomerButton } from '@/components/dashboard/delete-customer-button'
import { ContractStatusSelect } from '@/components/dashboard/contract-status-select'
import { ContractLockupCell } from '@/components/dashboard/contract-lockup-cell'
import { ConfirmBookingButton } from '@/components/dashboard/confirm-booking-button'
import { CancelQuoteButton } from '@/components/dashboard/cancel-quote-button'
import { ExcludeQuoteButton } from '@/components/dashboard/exclude-quote-button'
import { CancelledQuotesSection, type CancelledQuote } from '@/components/dashboard/cancelled-quotes-section'
import { DeleteLeadButton } from '@/components/dashboard/delete-lead-button'
import { formatFrequency } from '@/lib/utils/frequency'
import { contractAccruedRevenue, type ContractPriceSegment } from '@/lib/utils/ltv'
import { isActiveSalesStage, salesStageMeta } from '@/lib/business/sales-stage'
import { ClientSearchInput } from '@/components/dashboard/client-search-input'
import { ClientRowDetails } from '@/components/dashboard/client-row-details'
import { CallLink } from '@/components/dashboard/call-link'
import { formatCompactKRW } from '@/lib/format/krw'
import { normalizePhone } from '@/lib/format/phone'
import { Phone, MapPin, Calendar, TrendingUp, ChevronRight, Building2, User, Archive, Star, FileText } from 'lucide-react'

// ── 타입 ────────────────────────────────────────────────

type PendingQuoteRow = {
  id: string
  customer_name: string
  customer_phone: string | null
  cleaning_type: string | null
  space_size: number | null
  preferred_date: string | null
  good_price: number | null
  better_price: number | null
  best_price: number | null
  created_at: string
}

type CustomerRow = {
  id: string
  name: string
  phone: string | null
  address: string | null
  category: string | null
  type: string
  notes: string | null
  lead_id: string | null
  sales_stage: string | null
  created_at: string
}

type LeadRow = {
  id: string
  company_name: string
  phone: string | null
  address: string | null
  status: string
  customer_type: string
  monthly_budget: number | null
  next_follow_up_date: string | null
  notes: string | null
  created_at: string
}

type ContractRow = {
  id: string
  customer_id: string
  service_type: string
  frequency: string
  contract_price: number
  status: string
  start_date: string
  end_date: string | null
  requires_lockup: boolean | null
  expected_duration_minutes: number | null
  checklist_items: { id: string; label: string }[] | null
  // 월 금액 변경 이력 — 누적 매출을 구간별로 계산해 과거 소급을 막는다
  price_history: ContractPriceSegment[] | null
  notes: string | null
  skip_holidays: boolean | null
  send_visit_reminder: boolean | null
}

// 계약 수정 모달에 넘길 값만 추림 (메모까지 넘겨야 저장 시 기존 메모가 지워지지 않는다)
function contractToEdit(c: ContractRow) {
  return {
    id: c.id,
    service_type: c.service_type,
    frequency: c.frequency,
    contract_price: c.contract_price,
    start_date: c.start_date,
    end_date: c.end_date,
    notes: c.notes,
    skip_holidays: c.skip_holidays,
    send_visit_reminder: c.send_visit_reminder,
  }
}

type B2bQuoteRow = {
  lead_id: string | null
  total_amount: number
  frequency: string | null
}

// ── 상수 ────────────────────────────────────────────────

// 거래 형태 배지 — '누구(개인/거래처)'와는 독립된 축.
// 정기계약(활성)이 있으면 '정기계약중', 없으면 '일회성'으로 자동 표시.
// 거래처든 개인이든 계약 등록 전에는 '일회성'으로 보인다(거래처의 계약 전 대청소 등).
function txFormBadge(hasActiveContract: boolean): { label: string; className: string } {
  return hasActiveContract
    ? { label: '정기계약중', className: 'bg-emerald-100 text-emerald-700' }
    : { label: '일회성', className: 'bg-amber-100 text-amber-700' }
}

const PIPELINE_STAGE: Record<string, { text: string; color: string }> = {
  new:         { text: '새 문의',   color: 'bg-gray-100 text-gray-700' },
  contacted:   { text: '연락함',    color: 'bg-blue-100 text-blue-700' },
  follow_up:   { text: '현장 방문', color: 'bg-indigo-100 text-indigo-700' },
  quoted:      { text: '견적 보냄', color: 'bg-amber-100 text-amber-700' },
  negotiating: { text: '금액 협의', color: 'bg-orange-100 text-orange-700' },
  contracted:  { text: '계약 완료', color: 'bg-green-100 text-green-700' },
  rejected:    { text: '포기',      color: 'bg-red-100 text-red-600' },
}

// 진행 중 목록에서 내리는 상태 — 끝난 건(포기)과 손으로 보관한 건.
// '포기'가 계속 '영업 중'에 섞여 있으면 고객이 쌓일수록 진짜 진행 중인 곳이 끝난 곳 사이에 묻힌다.
// 지우는 게 아니라 아래 '끝난 거래처'로 접어두는 것이라, 다시 영업하려면 펼쳐서 되살리면 된다.
const CLOSED_LEAD_STATUSES = new Set(['archived', 'rejected'])

const TABS = [
  { key: 'all',        label: '전체' },
  { key: 'individual', label: '개인 고객' },
  { key: 'company',    label: '거래처' },
]

const SORT_OPTIONS = [
  { key: 'ltv_desc', label: '누적 매출 많은순' },
  { key: 'ltv_asc',  label: '누적 매출 적은순' },
  { key: 'newest',   label: '최신순' },
  { key: 'oldest',   label: '오래된순' },
]

// ── URL 파라미터 헬퍼 ────────────────────────────────────

type ListParams = {
  type?: string
  sort?: string
  show_archived?: string
  show_dormant?: string
  all?: string
  q?: string
}

function buildHref(params: ListParams) {
  const p = new URLSearchParams()
  if (params.type && params.type !== 'all') p.set('type', params.type)
  if (params.sort && params.sort !== 'ltv_desc') p.set('sort', params.sort)
  if (params.show_archived === '1') p.set('show_archived', '1')
  if (params.show_dormant === '1') p.set('show_dormant', '1')
  if (params.all) p.set('all', params.all)
  if (params.q) p.set('q', params.q)
  const qs = p.toString()
  return `/dashboard/clients${qs ? '?' + qs : ''}`
}

// 한 번에 그리는 최대 개수 — 넘으면 '더 보기'로 펼친다.
// 고객이 300명이면 카드 300장을 그대로 그리던 것이 목록이 안 보이는 진짜 원인이었다.
const LIST_LIMIT = 20

// 마지막 거래가 이만큼 지나면 '지난 고객'으로 접어둔다. 거래 성격에 따라 다르다.
//
// 개인 일회성은 짧게 — 사장님 판단: "어차피 재구매 확률이 낮고 주기가 길다. 작업 마치면
// 일주일만 보관해도 된다." 완료 직후 며칠은 보고서 발송·후기 요청 같은 뒷일이 남으므로
// 0일이 아니라 7일로 둔다(그 사이 예약이 잡히면 열린 일감이 되어 애초에 안 접힌다).
//
// 거래처(법인)와 계약을 해본 곳은 길게 — 재계약·업셀 여지가 있어 눈에 두고 본다.
const DORMANT_ONEOFF_DAYS = 7
const DORMANT_CONTRACT_DAYS = 180

// ── 페이지 ────────────────────────────────────────────────

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>
}) {
  const { type, sort = 'ltv_desc', show_archived, show_dormant, all, q } = await searchParams
  const searchQuery = q?.trim().toLowerCase() ?? ''
  const activeTab = ['individual', 'company'].includes(type ?? '') ? type! : 'all'
  const showArchived = show_archived === '1'
  const showDormant = show_dormant === '1'
  // 어느 구획을 펼쳤는지 — 개인 '더 보기'를 눌렀다고 거래처·지난 고객까지 펼쳐지면 안 된다
  const expanded = new Set((all ?? '').split(',').filter(Boolean))
  const isExpanded = (key: string) => expanded.has(key)
  // 검색 중에는 지난 고객도 결과에 나와야 한다 — 찾으려고 친 이름이 접혀 있으면 검색이 고장 난 것처럼 보인다
  const isSearching = searchQuery.length > 0

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')
  const businessId = profile.business_id

  const [
    { data: customers },
    { data: contracts },
    { data: completedBookings },
    { data: leads },
    { data: registeredLeadRows },
    { data: b2bQuotes },
    reviewClaimsResult,
    { data: pendingQuotes },
    { data: serviceItems },
    { data: cancelledQuotes },
    { data: openBookings },
  ] = await Promise.all([
    db.from('customers')
      .select('id, name, phone, address, category, type, notes, lead_id, sales_stage, created_at')
      .eq('business_id', businessId),

    db.from('contracts')
      .select('id, customer_id, service_type, frequency, contract_price, status, start_date, end_date, requires_lockup, expected_duration_minutes, checklist_items, price_history, notes, skip_holidays, send_visit_reminder' as never)
      .eq('business_id', businessId),

    db.from('bookings')
      .select('customer_phone, final_price, scheduled_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .is('deleted_at', null),

    db.from('leads')
      .select('id, company_name, phone, address, status, customer_type, monthly_budget, next_follow_up_date, notes, created_at')
      .eq('business_id', businessId),

    db.from('customers')
      .select('lead_id')
      .eq('business_id', businessId)
      .not('lead_id', 'is', null),

    db.from('b2b_quotes')
      .select('lead_id, total_amount, frequency')
      .eq('business_id', businessId),

    // 리뷰 작성 이력이 있는 고객 전화번호
    db.from('review_claims' as never)
      .select('customer_phone' as never)
      .eq('business_id' as never, businessId)
      .not('claimed_at' as never, 'is', null),

    // 예약 미확정 견적 요청 (공개 폼으로 들어온) — 테스트/장난 견적(is_test)은 제외
    db.from('quotes')
      .select('id, customer_name, customer_phone, cleaning_type, space_size, preferred_date, good_price, better_price, best_price, created_at')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .eq('is_test' as never, false as never)
      .order('created_at', { ascending: false }),

    // 사이드바 '서비스 항목'에 등록된 서비스 (활성만) — 이름 + 기본 가격 + 단위
    db.from('service_items')
      .select('name, base_price, unit')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name', { ascending: true }),

    // 취소한 견적 요청 (되살리기 가능) — 최근 30건, 테스트로 표시한 건 제외
    db.from('quotes')
      .select('id, customer_name, customer_phone, cleaning_type, space_size, good_price')
      .eq('business_id', businessId)
      .eq('status', 'cancelled')
      .eq('is_test' as never, false as never)
      .order('created_at', { ascending: false })
      .limit(30),

    // 아직 안 끝난 일감 — 앞으로 잡힌 방문과 지금 진행 중인 방문.
    // '완료된 고객'을 가르는 기준이 된다. 취소·완료는 열린 일감이 아니다.
    db.from('bookings')
      .select('customer_phone, scheduled_at')
      .eq('business_id', businessId)
      .in('status', ['confirmed', 'in_progress'])
      .is('deleted_at', null),
  ])

  // 폼 서비스 선택용 — 이름+가격+단위, 이름 기준 중복 제거 (첫 항목 유지)
  const serviceMap = new Map<string, { base_price: number; unit: string }>()
  for (const s of serviceItems ?? []) {
    const name = (s.name ?? '').trim()
    if (name && !serviceMap.has(name)) serviceMap.set(name, { base_price: s.base_price ?? 0, unit: s.unit ?? '개' })
  }
  const services = [...serviceMap].map(([name, v]) => ({ name, base_price: v.base_price, unit: v.unit }))

  // 전화번호 → 예약 실적 맵
  // 키는 숫자만(normalizePhone)으로 통일 — 예약은 01055265406, 고객 카드는 010-5526-5406처럼
  // 형식이 달라도 같은 고객으로 묶어 이력·누적 매출이 올바른 카드에 붙게 한다.
  const bookingMap: Record<string, { ltv: number; count: number; lastDate: string }> = {}
  for (const b of completedBookings ?? []) {
    const key = normalizePhone(b.customer_phone)
    if (!key) continue
    const prev = bookingMap[key]
    if (prev) {
      prev.ltv += b.final_price ?? 0
      prev.count += 1
      if ((b.scheduled_at ?? '') > prev.lastDate) prev.lastDate = b.scheduled_at ?? ''
    } else {
      bookingMap[key] = { ltv: b.final_price ?? 0, count: 1, lastDate: b.scheduled_at ?? '' }
    }
  }

  const contractMap: Record<string, ContractRow[]> = {}
  for (const c of (contracts ?? []) as unknown as ContractRow[]) {
    if (!contractMap[c.customer_id]) contractMap[c.customer_id] = []
    contractMap[c.customer_id]!.push(c)
  }

  const b2bQuoteMap: Record<string, B2bQuoteRow> = {}
  // 리드별 보낸 견적 장수 — 여러 장 발송한 경우 목록에서 '견적 N장 발송'으로 표시
  const b2bQuoteCountMap: Record<string, number> = {}
  for (const q of b2bQuotes ?? []) {
    if (q.lead_id) {
      b2bQuoteMap[q.lead_id] = q
      b2bQuoteCountMap[q.lead_id] = (b2bQuoteCountMap[q.lead_id] ?? 0) + 1
    }
  }

  const registeredLeadIds = new Set((registeredLeadRows ?? []).map((r) => r.lead_id))
  const reviewedPhones = new Set(
    ((reviewClaimsResult as unknown as { data: { customer_phone: string }[] | null }).data ?? [])
      .map((r) => normalizePhone(r.customer_phone))
      .filter(Boolean)
  )
  const today = new Date().toISOString().slice(0, 10)

  // ── 정렬 함수 ──

  function sortCustomers(list: CustomerRow[]): CustomerRow[] {
    const withLtv = list.map(c => {
      const bookingLtv = c.phone ? (bookingMap[normalizePhone(c.phone)]?.ltv ?? 0) : 0
      // 통합 LTV = 일회성 예약 합계 + 계약 누적(경과 개월 × 월계약금)
      const ltv = bookingLtv + contractAccruedRevenue(contractMap[c.id] ?? [])
      return { c, ltv }
    })
    if (sort === 'ltv_asc') return withLtv.sort((a, b) => a.ltv - b.ltv).map(x => x.c)
    if (sort === 'newest')  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (sort === 'oldest')  return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return withLtv.sort((a, b) => b.ltv - a.ltv).map(x => x.c)
  }

  function sortLeads(list: LeadRow[]): LeadRow[] {
    const withVal = list.map(l => ({ l, val: b2bQuoteMap[l.id]?.total_amount ?? l.monthly_budget ?? 0 }))
    if (sort === 'ltv_asc') return withVal.sort((a, b) => a.val - b.val).map(x => x.l)
    if (sort === 'newest')  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (sort === 'oldest')  return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return withVal.sort((a, b) => b.val - a.val).map(x => x.l)
  }

  // ── 데이터 분류 ──

  // 이름·전화·주소 검색 필터
  //
  // 이름만 찾으면 목록이 길어졌을 때 못 찾는다 — 사장님은 "010-7414 그 치과", "언양 그 집"처럼
  // 번호나 동네로 기억한다. 전화는 010-1234-5678 / 01012345678 두 형식이 섞여 저장돼 있어
  // 양쪽 다 숫자만 남겨 비교한다.
  const searchDigits = searchQuery.replace(/[^0-9]/g, '')
  const matchesSearch = (name: string | null, phone?: string | null, address?: string | null) => {
    if (!searchQuery) return true
    if ((name ?? '').toLowerCase().includes(searchQuery)) return true
    if ((address ?? '').toLowerCase().includes(searchQuery)) return true
    if (searchDigits && normalizePhone(phone).includes(searchDigits)) return true
    return false
  }

  // type 필드 기준으로 개인/법인 분리 + 검색 필터
  const individualCustomers = sortCustomers((customers ?? []).filter(c => c.type !== 'recurring' && matchesSearch(c.name, c.phone, c.address)))
  const companyCustomers = sortCustomers((customers ?? []).filter(c => c.type === 'recurring' && matchesSearch(c.name, c.phone, c.address)))
  // 전환된 거래처 중 지금 영업(정기계약 업셀 등) 진행 중인 곳 — 자동 배지와 별개로 손으로 지정한 것
  const companyInSales = companyCustomers.filter(c => isActiveSalesStage(c.sales_stage))

  // ── 열린 일감 ──
  //
  // 잡버·서비스타이탄은 '고객'과 '일감'을 절대 같은 목록에 안 섞는다. 고객은 영구히 남는
  // 주소록이고, 완료되는 건 고객이 아니라 그 사람에게 걸린 일감(Job)이다. 우리 화면은
  // 둘을 한 목록에 섞어놔서, 일이 끝난 고객과 오늘 손댈 고객이 똑같이 생겼다.
  //
  // 그래서 페이지를 새로 만들어 옮기는 대신(⛔7월에 두 페이지를 하나로 합친 이유가 있다)
  // 같은 화면 안에서 '열린 일감이 있는가'로 갈라 생김새를 다르게 한다.
  //
  // 오늘(KST) 0시 — 오늘 예정된 방문은 아직 안 끝난 일이므로 열린 일감에 든다
  // (서버 컴포넌트라 요청마다 서버에서 한 번만 실행 — 브라우저 재렌더와 무관)
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const todayKST = new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const todayStartKST = new Date(`${todayKST}T00:00:00+09:00`).toISOString()
  const openWorkPhones = new Set(
    ((openBookings ?? []) as { customer_phone: string | null; scheduled_at: string | null }[])
      .filter(b => (b.scheduled_at ?? '') >= todayStartKST)
      .map(b => normalizePhone(b.customer_phone))
      .filter(Boolean)
  )
  const pendingQuotePhones = new Set(
    ((pendingQuotes ?? []) as PendingQuoteRow[]).map(q => normalizePhone(q.customer_phone)).filter(Boolean)
  )

  // 열린 일감 = 살아 있는 정기계약 · 앞으로 잡힌(또는 지금 하는) 방문 · 답 기다리는 견적
  function hasOpenWork(c: CustomerRow): boolean {
    if ((contractMap[c.id] ?? []).some(k => k.status === 'active')) return true
    const key = normalizePhone(c.phone)
    if (!key) return false
    return openWorkPhones.has(key) || pendingQuotePhones.has(key)
  }

  // ── 거래 중 / 지난 고객 ──
  //
  // 고객은 지우지 않으니 영구히 쌓인다. 청소 한 번 받고 끝난 손님이 몇 년치 모이면
  // 정작 이번 달에 손댈 곳이 그 사이에 묻힌다. 마지막 거래를 기준으로 갈라
  // 기본 목록에는 '거래 중'만 두고, 지난 고객은 접어둔다(지우는 게 아니다).
  //
  // ⛔ 사장님이 손으로 '완료' 표시를 하게 만들지 말 것 — 안 누르면 아무 효과가 없고,
  //    누르는 일 자체가 새 업무가 된다. 이미 쌓인 방문 기록에서 자동으로 갈린다.
  const oneOffCutoff = new Date(nowMs - DORMANT_ONEOFF_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const contractCutoff = new Date(nowMs - DORMANT_CONTRACT_DAYS * 24 * 60 * 60 * 1000).toISOString()

  function lastDealAt(c: CustomerRow): string {
    const lastVisit = c.phone ? (bookingMap[normalizePhone(c.phone)]?.lastDate ?? '') : ''
    // 방문 이력이 없으면 등록일을 마지막 접점으로 본다(문의만 받고 안 온 손님도 언젠간 접힌다)
    return lastVisit || c.created_at
  }

  function isDormant(c: CustomerRow): boolean {
    // 지금 영업 중으로 손수 지정해둔 곳은 접지 않는다
    if (isActiveSalesStage(c.sales_stage)) return false
    // 열린 일감이 있으면 접지 않는다 — 정기계약·예정 방문·대기 견적.
    // 작업이 끝나도 보고서 발송·후기 요청 같은 뒷일이 남으므로 완충 기간(아래)을 둔다.
    if (hasOpenWork(c)) return false
    // 짧게 접는 건 '개인 일회성'뿐이다.
    // ⚠️거래처(법인)는 계약이 아직 없어도 오래 둔다 — 한 번 대청소하고 몇 달 뒤 정기로
    //   넘어가는 게 B2B 영업 동선이라, 일주일 만에 접으면 영업 대상이 통째로 사라진다.
    const keepLong = c.type === 'recurring' || (contractMap[c.id] ?? []).length > 0
    return lastDealAt(c) < (keepLong ? contractCutoff : oneOffCutoff)
  }

  // 검색 중에는 가르지 않는다 — 찾으려는 사람이 접혀 있으면 검색이 고장 난 것처럼 보인다
  const splitDormant = (list: CustomerRow[]) =>
    isSearching
      ? { live: list, dormant: [] as CustomerRow[] }
      : { live: list.filter(c => !isDormant(c)), dormant: list.filter(isDormant) }

  const { live: individualLive, dormant: individualDormant } = splitDormant(individualCustomers)
  const { live: companyLive, dormant: companyDormant } = splitDormant(companyCustomers)
  // 지난 고객은 최근에 끝난 순으로 — 다시 부를 곳을 찾는 자리라 금액순은 뜻이 없다
  const byRecentDeal = (a: CustomerRow, b: CustomerRow) => lastDealAt(b).localeCompare(lastDealAt(a))
  const dormantList = [...individualDormant, ...companyDormant].sort(byRecentDeal)
  const dormantCount = dormantList.length

  // ── 진행 중 / 완료 ──
  const individualActive = individualLive.filter(hasOpenWork)
  // 완료 목록은 '언제 끝났나'를 보는 자리 — 전체 정렬(금액순)이 아니라 최근 완료순으로 고정한다
  const individualDone = individualLive.filter(c => !hasOpenWork(c)).sort(byRecentDeal)
  const companyActive = companyLive.filter(hasOpenWork)
  const companyDone = companyLive.filter(c => !hasOpenWork(c)).sort(byRecentDeal)

  // 완료된 곳은 카드가 아니라 한 줄로 — 목록에서 눈이 안 걸리게 확실히 낮춘다.
  // 지우거나 다른 페이지로 보내지 않는다. 이름을 누르면 이력·견적서가 그대로 있다.
  function doneRow(customer: CustomerRow) {
    const customerContracts = contractMap[customer.id] ?? []
    const bookingLtv = customer.phone ? (bookingMap[normalizePhone(customer.phone)]?.ltv ?? 0) : 0
    const ltv = bookingLtv + contractAccruedRevenue(customerContracts)
    const last = customer.phone ? (bookingMap[normalizePhone(customer.phone)]?.lastDate ?? '') : ''
    return (
      <div key={`done-${customer.id}`} className="flex items-center gap-2 px-4 py-2.5">
        <Link href={`/dashboard/clients/${customer.id}`} className="text-sm text-muted-foreground hover:text-foreground truncate">
          {customer.name}
        </Link>
        {last && (
          <span className="text-xs text-muted-foreground/70 shrink-0">
            {new Date(last).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })} 완료
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {ltv > 0 && <span className="text-xs tabular-nums text-muted-foreground">{ltv.toLocaleString('ko-KR')}원</span>}
          {customer.phone && (
            <CallLink
              phone={customer.phone}
              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"
              iconClassName="h-3.5 w-3.5 text-muted-foreground"
            />
          )}
          <Link href={`/dashboard/clients/${customer.id}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border">
            이력<ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    )
  }

  const activeLeads = sortLeads(
    (leads ?? []).filter(l => l.customer_type === 'company' && !CLOSED_LEAD_STATUSES.has(l.status) && !registeredLeadIds.has(l.id) && matchesSearch(l.company_name, l.phone, l.address))
  )
  const closedLeads = (leads ?? []).filter(l => l.customer_type === 'company' && CLOSED_LEAD_STATUSES.has(l.status) && matchesSearch(l.company_name, l.phone, l.address))

  // 끝난 목록을 펼쳤을 때만 — 삭제 확인창에 "상담 기록 N개도 함께 지워져요"를 정확히 띄우기 위한 개수
  const archivedActivityCount: Record<string, number> = {}
  if (showArchived && closedLeads.length > 0) {
    const { data: archivedActivities } = await db
      .from('lead_activities')
      .select('lead_id')
      .eq('business_id', businessId)
      .in('lead_id', closedLeads.map(l => l.id))
    for (const a of archivedActivities ?? []) {
      if (a.lead_id) archivedActivityCount[a.lead_id] = (archivedActivityCount[a.lead_id] ?? 0) + 1
    }
  }

  // 개인 상담 리드 (leads의 individual) — 상담창·현장견적 문의로 들어온 개인
  //
  // ★새 문의(status 'new')는 이미 고객이어도 반드시 보여준다.
  //   예전엔 전화번호가 고객 명단에 있으면 통째로 숨겼는데, 그러면 단골이 다시 문의했을 때
  //   대표 폰으로 알림만 오고 화면 어디에도 안 남았다("명단에 남는다"고 해놓고 사라짐).
  //   재문의는 놓치면 안 되는 재구매 신호라, 중복 걱정은 숨기기가 아니라 '기존 고객' 배지로 푼다.
  const customerByPhone = new Map(
    (customers ?? []).filter(c => c.phone).map(c => [normalizePhone(c.phone), c] as const)
  )
  const individualLeads = sortLeads(
    (leads ?? []).filter(l =>
      l.customer_type !== 'company' &&
      !CLOSED_LEAD_STATUSES.has(l.status) &&
      (l.status === 'new' || (!registeredLeadIds.has(l.id) && !customerByPhone.has(normalizePhone(l.phone)))) &&
      matchesSearch(l.company_name, l.phone, l.address)
    )
  )

  // 지금 화면 상태를 기본으로 깔고, 바꿀 것만 덮어쓰는 링크 헬퍼.
  // 안 그러면 정렬을 누르는 순간 펼쳐둔 '지난 고객'이 도로 접힌다.
  const currentParams: ListParams = {
    type: activeTab,
    sort,
    show_archived: showArchived ? '1' : undefined,
    show_dormant: showDormant ? '1' : undefined,
    all: expanded.size > 0 ? [...expanded].join(',') : undefined,
    q: searchQuery || undefined,
  }
  const href = (overrides: ListParams = {}) => buildHref({ ...currentParams, ...overrides })
  // 누른 구획만 펼친다 — 이미 펼친 구획은 그대로 유지
  const expandHref = (key: string) => href({ all: [...new Set([...expanded, key])].join(',') })

  const totalLtv = (completedBookings ?? []).reduce((s, b) => s + (b.final_price ?? 0), 0)
  const monthlyRecurring = ((contracts ?? []) as unknown as ContractRow[]).filter(c => c.status === 'active').reduce((s, c) => s + c.contract_price, 0)

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">고객 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">개인 고객과 법인 거래처를 한 곳에서 관리해요</p>
        </div>
        <AddClientForm services={services} />
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">개인 고객</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-blue-600">
            {individualLive.length}<span className="text-sm font-normal text-muted-foreground ml-0.5">명</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {(pendingQuotes ?? []).length > 0 ? <span className="text-amber-600 font-medium">견적 대기 {(pendingQuotes ?? []).length}건 ·</span> : null}
            {' '}누적 {totalLtv > 0 ? `${Math.round(totalLtv / 10000)}만원` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">거래처</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-violet-600">
            {activeLeads.length}<span className="text-sm font-normal text-muted-foreground ml-0.5">곳</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">등록된 거래처 {companyLive.length}곳</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">월 정기 매출</p>
          {/* 좁은 카드를 안 넘치게: 만원/억원 축약 + 폰트 자동 축소(clamp) */}
          <p className="text-[clamp(0.95rem,4.2vw,1.5rem)] font-bold mt-1 tabular-nums whitespace-nowrap text-emerald-600">
            {formatCompactKRW(monthlyRecurring)}
          </p>
          {monthlyRecurring > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> 활성 계약 기준
            </p>
          )}
        </div>
      </div>

      {/* 탭 + 정렬 */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={href({ type: tab.key })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto shrink-0">
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.key}
              href={href({ sort: opt.key })}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                sort === opt.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 검색 */}
      <ClientSearchInput />

      {/* ── 개인·일반 고객 ── */}
      {(activeTab === 'all' || activeTab === 'individual') && (
        <section className="space-y-2">
          {activeTab === 'all' && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-blue-600">개인 고객</h2>
              <span className="text-xs text-muted-foreground">({individualLive.length}명)</span>
            </div>
          )}

          {/* 예약 미확정 견적 요청 */}
          {(pendingQuotes ?? []).length > 0 && (
            <div className="space-y-2 mb-1">
              <p className="text-xs font-semibold text-amber-600 px-0.5 flex items-center gap-1.5">
                견적 요청 중 — 예약 확정 대기
                <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">{(pendingQuotes ?? []).length}건</span>
              </p>
              {(pendingQuotes as PendingQuoteRow[]).map((quote) => (
                <div key={`quote-${quote.id}`} className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700">견적 요청</span>
                        <p className="font-semibold">{quote.customer_name}</p>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {quote.customer_phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />{quote.customer_phone}
                          </p>
                        )}
                        {quote.cleaning_type && (
                          <p className="text-xs text-muted-foreground">
                            {quote.cleaning_type}{quote.space_size ? ` · ${quote.space_size}평` : ''}
                            {quote.preferred_date ? ` · ${new Date(quote.preferred_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} 희망` : ''}
                          </p>
                        )}
                        {quote.good_price && (
                          <p className="text-xs text-amber-700 font-medium">견적가 {quote.good_price.toLocaleString('ko-KR')}원~</p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <ConfirmBookingButton
                        quoteId={quote.id}
                        goodPrice={quote.good_price}
                        betterPrice={quote.better_price}
                        bestPrice={quote.best_price}
                        preferredDate={quote.preferred_date}
                      />
                      <CancelQuoteButton quoteId={quote.id} />
                      <ExcludeQuoteButton quoteId={quote.id} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 취소한 견적 (되살리기 가능) — 평소엔 접혀 있음 */}
          <CancelledQuotesSection quotes={(cancelledQuotes ?? []) as CancelledQuote[]} />

          {/* 상담·문의 중 개인 (leads) — AI 상담·현장견적 문의 */}
          {individualLeads.length > 0 && (
            <div className="space-y-2 mb-1">
              <p className="text-xs font-semibold text-muted-foreground px-0.5">상담·문의 중 ({individualLeads.length})</p>
              {individualLeads.map((lead) => {
                const stage = PIPELINE_STAGE[lead.status] ?? PIPELINE_STAGE.new
                // 같은 번호로 이미 등록된 고객이면 알려준다 — 새로 온 손님인지 단골의 재문의인지가
                // 전화를 걸기 전에 보여야 무슨 말부터 할지 정할 수 있다
                const knownCustomer = customerByPhone.get(normalizePhone(lead.phone))
                return (
                  <Link
                    key={`ilead-${lead.id}`}
                    href={`/dashboard/pipeline/${lead.id}`}
                    className="block bg-white rounded-xl border p-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-sky-100 text-sky-700">개인</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${stage.color}`}>{stage.text}</span>
                          <p className="font-semibold">{lead.company_name}</p>
                          {knownCustomer && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
                              기존 고객 · {knownCustomer.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {lead.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />{lead.phone}
                            </p>
                          )}
                          {lead.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{lead.notes}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {individualActive.length === 0 && individualDone.length === 0 && (pendingQuotes ?? []).length === 0 && individualLeads.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">아직 개인 고객이 없어요</p>
              <p className="text-xs text-muted-foreground">고객 링크를 공유하면 견적 요청이 자동으로 들어와요</p>
            </div>
          ) : (
            individualActive.slice(0, isExpanded('ind') ? undefined : LIST_LIMIT).map((customer) => {
              const booking = customer.phone ? bookingMap[normalizePhone(customer.phone)] : undefined
              const customerContracts = contractMap[customer.id] ?? []
              const activeContract = customerContracts.find((c) => c.status === 'active') ?? null
              const hasAnyContract = customerContracts.length > 0
              // 통합 LTV = 일회성 예약 합계 + 계약 누적
              const ltv = (booking?.ltv ?? 0) + contractAccruedRevenue(customerContracts)
              const bookingCount = booking?.count ?? 0
              const lastVisitDate = booking?.lastDate ?? null
              const txBadge = txFormBadge(Boolean(activeContract))

              return (
                <div key={`customer-${customer.id}`} className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-sky-100 text-sky-700">개인</span>
                        <Link href={`/dashboard/clients/${customer.id}`} className="font-semibold hover:text-primary hover:underline transition-colors">
                          {customer.name}
                        </Link>
                        {customer.category && (
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{customer.category}</span>
                        )}
                        {/* 거래 형태(일회성/정기) — 신원(개인)과 별개로 계약 유무에 따라 자동 표시 */}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${txBadge.className}`}>{txBadge.label}</span>
                        {customer.phone && reviewedPhones.has(normalizePhone(customer.phone)) && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-0.5">
                            <Star className="h-3 w-3" />
                            리뷰 작성
                          </span>
                        )}
                        {customer.phone && <CallLink phone={customer.phone} className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center hover:bg-sky-200 transition-colors shrink-0" iconClassName="h-3.5 w-3.5 text-sky-600" />}
                      </div>
                      {/* 마지막 방문은 재방문 판단에 바로 쓰이는 값이라 접지 않는다 — '자세히'와 같은 줄에 둔다 */}
                      <ClientRowDetails
                        hasDetails={Boolean(customer.phone || customer.address || activeContract)}
                        summary={(
                          <>
                            {lastVisitDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3 shrink-0" />
                                마지막 방문 {new Date(lastVisitDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}
                                {bookingCount > 1 && ` · 총 ${bookingCount}회`}
                              </span>
                            )}
                            {/* 작업 항목을 아직 안 정한 정기계약만 접힌 줄에 올린다.
                                '자세히'를 눌러야 나오면 비테크 사장님은 못 찾는다(실사용 0건이었다).
                                정하고 나면 여기서 사라지고 '자세히' 안으로 들어간다 — 잔소리로 남기지 않는다. */}
                            {activeContract && (activeContract.checklist_items ?? []).length === 0 && (
                              <ContractLockupCell
                                contractId={activeContract.id}
                                requiresLockup={activeContract.requires_lockup ?? false}
                                expectedDurationMinutes={activeContract.expected_duration_minutes ?? null}
                                checklistItems={[]}
                                only="checklist"
                              />
                            )}
                          </>
                        )}
                      >
                          {customer.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />{customer.phone}
                            </p>
                          )}
                          {customer.address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />{customer.address}
                            </p>
                          )}
                          {activeContract && (
                            <div className="mt-2 pt-2 border-t flex items-center gap-2 flex-wrap">
                              <p className="text-xs text-muted-foreground">
                                {activeContract.service_type} · {formatFrequency(activeContract.frequency)}
                              </p>
                              <ContractStatusSelect contractId={activeContract.id} currentStatus={activeContract.status} />
                              <ContractLockupCell
                                contractId={activeContract.id}
                                requiresLockup={activeContract.requires_lockup ?? false}
                                expectedDurationMinutes={activeContract.expected_duration_minutes ?? null}
                                checklistItems={activeContract.checklist_items ?? []}
                              />
                            </div>
                          )}
                        </ClientRowDetails>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <div className="text-right">
                        {ltv > 0 && (
                          <>
                            <p className="text-[10px] text-muted-foreground leading-none">누적 가치</p>
                            <p className="text-base font-bold tabular-nums">{ltv.toLocaleString('ko-KR')}원</p>
                          </>
                        )}
                        {activeContract && (
                          <p className="text-xs text-emerald-600 font-medium tabular-nums">
                            {activeContract.contract_price.toLocaleString('ko-KR')}원/월
                          </p>
                        )}
                        {ltv === 0 && !activeContract && <p className="text-xs text-muted-foreground">실적 없음</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Link href={`/dashboard/clients/${customer.id}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-primary/30">
                          이력<ChevronRight className="h-3 w-3" />
                        </Link>
                        {/* 수정은 연필 하나로 통합 — 고객 정보와 계약 내용을 같은 창에서 고친다 */}
                        {customer.phone && (
                          <EditCustomerButton
                            customer={{ ...customer, phone: customer.phone }}
                            contract={activeContract ? contractToEdit(activeContract) : null}
                          />
                        )}
                        <DeleteCustomerButton customerId={customer.id} customerName={customer.name} hasContract={hasAnyContract} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          {!isExpanded('ind') && individualActive.length > LIST_LIMIT && (
            <Link
              href={expandHref('ind')}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-xl py-3"
            >
              나머지 {individualActive.length - LIST_LIMIT}명 더 보기
            </Link>
          )}

          {/* 완료 — 다음 일정이 없는 곳. 카드가 아니라 한 줄로 낮춰 진행 중인 곳과 확실히 갈린다 */}
          {individualDone.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground px-1 mb-1.5">
                완료 ({individualDone.length}명) · 다음 일정이 없는 곳이에요
              </p>
              <div className="rounded-xl border bg-muted/20 divide-y">
                {individualDone.slice(0, isExpanded('ind_done') ? undefined : LIST_LIMIT).map(doneRow)}
              </div>
              {!isExpanded('ind_done') && individualDone.length > LIST_LIMIT && (
                <Link href={expandHref('ind_done')} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground mt-1.5">
                  나머지 {individualDone.length - LIST_LIMIT}명 더 보기
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── 정기계약·법인 고객 ── */}
      {(activeTab === 'all' || activeTab === 'company') && (
        <section className="space-y-2">
          {activeTab === 'all' && (
            <div className="flex items-center gap-2 mt-2">
              <Building2 className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-semibold text-violet-600">거래처</h2>
              <span className="text-xs text-muted-foreground">({activeLeads.length + companyInSales.length}곳 영업 중)</span>
            </div>
          )}

          {activeLeads.length === 0 && companyActive.length === 0 && companyDone.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">영업 중인 법인 거래처가 없어요</p>
              <p className="text-xs text-muted-foreground">위 &lsquo;고객 추가&rsquo; 버튼으로 거래처를 등록하세요</p>
            </div>
          ) : (
            activeLeads.map((lead) => {
              const stage = PIPELINE_STAGE[lead.status] ?? PIPELINE_STAGE['new']!
              const quoteCount = b2bQuoteCountMap[lead.id] ?? 0
              const isOverdue = Boolean(
                lead.next_follow_up_date &&
                lead.next_follow_up_date < today &&
                lead.status !== 'contracted' &&
                lead.status !== 'rejected'
              )

              return (
                <div key={`lead-${lead.id}`} className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-700">거래처</span>
                        <Link href={`/dashboard/pipeline/${lead.id}`} className="font-semibold hover:text-primary hover:underline transition-colors">
                          {lead.company_name}
                        </Link>
                        {isOverdue && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">연락 지연</span>
                        )}
                        {/* 번호 텍스트는 접어두고 수화기만 남긴다 — 목록에서 바로 걸 수 있어야 접는 의미가 있다 */}
                        {lead.phone && <CallLink phone={lead.phone} className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center hover:bg-violet-200 transition-colors shrink-0" />}
                      </div>
                      {/* 다음 연락 날짜는 '지금 할 일'이라 접지 않는다 — '자세히'와 같은 줄에 둔다 */}
                      <ClientRowDetails
                        hasDetails={Boolean(lead.phone || lead.address)}
                        summary={lead.next_follow_up_date ? (
                          <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-amber-600'}`}>
                            <Calendar className="h-3 w-3 shrink-0" />
                            다음 연락: {new Date(lead.next_follow_up_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            {isOverdue && ' (지났어요)'}
                          </span>
                        ) : null}
                      >
                          {lead.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />{lead.phone}
                            </p>
                          )}
                          {lead.address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />{lead.address}
                            </p>
                          )}
                      </ClientRowDetails>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {/* 아직 영업 중이라 견적 금액은 '확정 매출'이 아님 → 영업 단계를 크게 보여주고,
                          금액 대신 보낸 견적 장수만 작게 표시(여러 장 발송해도 헷갈리지 않게) */}
                      <span className={`text-sm px-3 py-1 rounded-full font-semibold ${stage.color}`}>{stage.text}</span>
                      {quoteCount > 0 ? (
                        <p className="text-[11px] text-muted-foreground">견적 {quoteCount}장 발송</p>
                      ) : lead.monthly_budget ? (
                        <p className="text-[11px] text-muted-foreground tabular-nums">예상 ~{lead.monthly_budget.toLocaleString('ko-KR')}원/월</p>
                      ) : null}
                      <Link href={`/dashboard/pipeline/${lead.id}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-primary/30">
                        영업 관리<ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {/* 등록된 거래처(법인 고객, type='recurring') — 계약 유무는 각 카드의 배지로 표시 */}
          {companyActive.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground px-1">등록된 거래처</p>
              {companyActive.slice(0, isExpanded('co') ? undefined : LIST_LIMIT).map((customer) => {
                const customerContracts = contractMap[customer.id] ?? []
                const activeContract = customerContracts.find((c) => c.status === 'active') ?? null
                const hasAnyContract = customerContracts.length > 0
                const bookingLtv = customer.phone ? (bookingMap[normalizePhone(customer.phone)]?.ltv ?? 0) : 0
                // 통합 LTV = 일회성 예약 합계 + 계약 누적
                const ltv = bookingLtv + contractAccruedRevenue(customerContracts)
                return (
                  <div
                    key={`company-${customer.id}`}
                    className={`rounded-xl border p-4 transition-colors ${
                      activeContract
                        ? 'bg-emerald-50 border-emerald-100 hover:border-emerald-300' // 정기계약중 — 초록 강조
                        : 'bg-white border-border hover:border-primary/30' // 일회성 거래처 — 중립(계약 전 대청소 등)
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-700">거래처</span>
                          <Link href={`/dashboard/clients/${customer.id}`} className="font-semibold hover:text-primary hover:underline">
                            {customer.name}
                          </Link>
                          {/* 거래 형태(일회성/정기) — 신원(거래처)과 별개로 계약 유무에 따라 자동 표시 */}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${txFormBadge(Boolean(activeContract)).className}`}>{txFormBadge(Boolean(activeContract)).label}</span>
                          {/* 영업 상태 — 자동 배지와 별개로 손으로 지정한 진행 중 영업 단계 */}
                          {salesStageMeta(customer.sales_stage) && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${salesStageMeta(customer.sales_stage)!.className}`}>
                              영업 중 · {salesStageMeta(customer.sales_stage)!.label}
                            </span>
                          )}
                          {customer.category && (
                            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{customer.category}</span>
                          )}
                          {customer.phone && <CallLink phone={customer.phone} className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center hover:bg-violet-200 transition-colors shrink-0" />}
                        </div>
                        {/* 계약 내용 한 줄만 남기고 나머지는 접는다. 금액은 오른쪽에 이미 있어 여기선 뺀다 */}
                        <ClientRowDetails
                          hasDetails={Boolean(customer.phone || customer.address || activeContract)}
                          summary={activeContract ? (
                            <>
                              <span className="text-xs text-muted-foreground">
                                {activeContract.service_type} · {formatFrequency(activeContract.frequency)}
                              </span>
                              {/* 위 거래처 카드와 같은 이유 — 안 정한 계약만 접힌 줄에 올린다 */}
                              {(activeContract.checklist_items ?? []).length === 0 && (
                                <ContractLockupCell
                                  contractId={activeContract.id}
                                  requiresLockup={activeContract.requires_lockup ?? false}
                                  expectedDurationMinutes={activeContract.expected_duration_minutes ?? null}
                                  checklistItems={[]}
                                  only="checklist"
                                />
                              )}
                            </>
                          ) : null}
                        >
                            {customer.phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />{customer.phone}
                              </p>
                            )}
                            {customer.address && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />{customer.address}
                              </p>
                            )}
                            {activeContract && (
                              <div className="mt-1.5">
                                <ContractLockupCell
                                  contractId={activeContract.id}
                                  requiresLockup={activeContract.requires_lockup ?? false}
                                  expectedDurationMinutes={activeContract.expected_duration_minutes ?? null}
                                  checklistItems={activeContract.checklist_items ?? []}
                                />
                              </div>
                            )}
                          </ClientRowDetails>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <div className="text-right">
                          {ltv > 0 && (
                            <>
                              <p className="text-[10px] text-muted-foreground leading-none">누적 가치</p>
                              <p className="text-base font-bold tabular-nums">{ltv.toLocaleString('ko-KR')}원</p>
                            </>
                          )}
                          {activeContract && (
                            <p className="text-xs text-emerald-600 font-medium tabular-nums">
                              {activeContract.contract_price.toLocaleString('ko-KR')}원/월
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* 견적서·시방서·계약서·서비스 이력이 모두 이 상세 페이지에 있어 버튼 하나로 통합 */}
                          <Link href={`/dashboard/clients/${customer.id}`} className="inline-flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 px-2 py-1 rounded border border-primary/30 hover:border-primary/50">
                            <FileText className="h-3 w-3" />견적서·이력
                          </Link>
                          {/* 수정은 연필 하나로 통합 — 고객 정보와 계약 내용(금액·주기)을 같은 창에서 고친다 */}
                          {customer.phone && (
                            <EditCustomerButton
                              customer={{ ...customer, phone: customer.phone }}
                              contract={activeContract ? contractToEdit(activeContract) : null}
                            />
                          )}
                          <DeleteCustomerButton customerId={customer.id} customerName={customer.name} hasContract={hasAnyContract} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!isExpanded('co') && companyActive.length > LIST_LIMIT && (
                <Link
                  href={expandHref('co')}
                  className="block w-full text-center text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-xl py-3"
                >
                  나머지 {companyActive.length - LIST_LIMIT}곳 더 보기
                </Link>
              )}
            </div>
          )}

          {/* 완료된 거래처 — 다음 일정이 없는 곳. 한 줄로 낮춘다 */}
          {companyDone.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground px-1 mb-1.5">
                완료 ({companyDone.length}곳) · 다음 일정이 없는 곳이에요
              </p>
              <div className="rounded-xl border bg-muted/20 divide-y">
                {companyDone.slice(0, isExpanded('co_done') ? undefined : LIST_LIMIT).map(doneRow)}
              </div>
              {!isExpanded('co_done') && companyDone.length > LIST_LIMIT && (
                <Link href={expandHref('co_done')} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground mt-1.5">
                  나머지 {companyDone.length - LIST_LIMIT}곳 더 보기
                </Link>
              )}
            </div>
          )}

          {/* 보관된 거래처 토글 */}
          {closedLeads.length > 0 && (
            <div className="mt-4">
              {!showArchived ? (
                <Link
                  href={href({ show_archived: '1' })}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Archive className="h-3.5 w-3.5" />
                  끝난 거래처 {closedLeads.length}곳 보기 (포기·보관)
                </Link>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">끝난 거래처 ({closedLeads.length}곳)</span>
                    </div>
                    <Link href={href({ show_archived: undefined })} className="text-xs text-muted-foreground hover:text-foreground underline">
                      숨기기
                    </Link>
                  </div>
                  {closedLeads.map((lead) => (
                    <div key={`archived-${lead.id}`} className="bg-muted/30 rounded-xl border border-dashed border-border p-4 opacity-70">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500">{lead.status === 'rejected' ? '포기' : '보관됨'}</span>
                            <p className="font-medium text-muted-foreground">{lead.company_name}</p>
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {lead.phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />{lead.phone}
                              </p>
                            )}
                            {lead.notes && <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{lead.notes}</p>}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          <Link href={`/dashboard/pipeline/${lead.id}`} className="text-xs text-primary hover:underline whitespace-nowrap">
                            다시 영업하기 →
                          </Link>
                          {/* 보관해 둔 거래처를 목록에서 아예 없앨 때 — 되돌릴 수 없어 확인창을 거친다 */}
                          <DeleteLeadButton
                            leadId={lead.id}
                            leadName={lead.company_name}
                            quoteCount={b2bQuoteCountMap[lead.id] ?? 0}
                            activityCount={archivedActivityCount[lead.id] ?? 0}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── 지난 고객 ──
          거래가 끝난 지 오래된 고객. 지우지 않고 접어둔다 — 목록에서 내려야 이번 달에
          손댈 곳이 보이고, 다시 부를 땐 검색으로 바로 찾을 수 있다. */}
      {dormantCount > 0 && (
        <div className="pt-2">
          {!showDormant ? (
            <Link
              href={href({ show_dormant: '1' })}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-xl py-3"
            >
              <Archive className="h-3.5 w-3.5" />
              지난 고객 {dormantCount}명 보기 — 6개월 넘게 거래가 없어요
            </Link>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">지난 고객 ({dormantCount}명)</span>
                </div>
                <Link href={href({ show_dormant: undefined })} className="text-xs text-muted-foreground hover:text-foreground underline">
                  숨기기
                </Link>
              </div>
              <p className="text-xs text-muted-foreground px-1">
                다시 부르고 싶은 곳이 있으면 이름을 눌러 이력을 보고 연락하세요.
              </p>
              {[...individualDormant, ...companyDormant]
                .slice(0, isExpanded('dormant') ? undefined : LIST_LIMIT)
                .map((customer) => {
                  const last = lastDealAt(customer)
                  return (
                    <div key={`dormant-${customer.id}`} className="bg-muted/30 rounded-xl border border-dashed border-border px-4 py-2.5 flex items-center gap-2">
                      <Link href={`/dashboard/clients/${customer.id}`} className="font-medium text-sm text-muted-foreground hover:text-foreground truncate">
                        {customer.name}
                      </Link>
                      {last && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          마지막 거래 {new Date(last).toLocaleDateString('ko-KR', { year: '2-digit', month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        {customer.phone && <CallLink phone={customer.phone} className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors" iconClassName="h-3.5 w-3.5 text-muted-foreground" />}
                        <Link href={`/dashboard/clients/${customer.id}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border">
                          이력<ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              {!isExpanded('dormant') && dormantCount > LIST_LIMIT && (
                <Link
                  href={expandHref('dormant')}
                  className="block w-full text-center text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-xl py-3"
                >
                  나머지 {dormantCount - LIST_LIMIT}명 더 보기
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
