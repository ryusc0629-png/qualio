import type { Metadata } from 'next'
import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PrintQuote } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/print-quote'
import { buildQuoteDocTitle, parseDocKind } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/quote-doc-title'
import { toMarketYmd } from '@/lib/format/datetime'

interface PublicQuoteData {
  quote: {
    id: string
    lead_id: string | null
    customer_id: string | null
    business_id: string
    public_token: string | null
    quote_number: string | null
    valid_until: string | null
    items: unknown
    total_amount: number
    tax_included: boolean
    conditions: string | null
    site_name: string | null
    site_address: string | null
    site_area: string | null
    frequency: string | null
    worker_count: number | null
    spec_content: string | null
    contract_content: string | null
    created_at: string | null
  }
  client: { id: string; company_name: string; contact_name: string | null; phone: string | null; address: string | null }
  business: {
    name: string; phone: string | null; address: string | null
    legal_name: string | null; business_number: string | null; owner_name: string | null; payment_account: string | null
  } | null
}

// 견적서 한 장 + 받는 곳 + 우리 업체를 한 번에 읽는다.
// cache()로 감싸는 이유: 제목(generateMetadata)과 본문(페이지)이 같은 요청 안에서 이 함수를 각각 부르는데,
// 감싸두면 DB는 한 번만 읽는다. (Next 문서 권장 — fetch가 아닌 조회는 React cache 사용)
const loadPublicQuote = cache(async (token: string): Promise<PublicQuoteData | null> => {
  const db = createServiceClient()

  // public_token은 마이그레이션으로 추가된 새 컬럼이라 타입에 아직 없음 → 단언 사용
  const { data: quote } = await db
    .from('b2b_quotes')
    .select('*')
    .eq('public_token' as never, token)
    .maybeSingle() as unknown as { data: PublicQuoteData['quote'] | null }

  if (!quote) return null

  // 견적서는 리드(영업 중) 또는 고객(계약 중)에 연결됨 — 어느 쪽이든 lead 형태로 맞춰 PrintQuote에 전달
  const businessPromise = db
    .from('businesses')
    .select('name, phone, address, legal_name, business_number, owner_name, payment_account' as never)
    .eq('id', quote.business_id)
    .maybeSingle() as unknown as Promise<{ data: PublicQuoteData['business'] }>

  let client: PublicQuoteData['client'] | null = null
  if (quote.customer_id) {
    const { data: c } = await db
      .from('customers')
      .select('id, name, phone, address')
      .eq('id', quote.customer_id)
      .maybeSingle()
    if (c) client = { id: c.id, company_name: c.name, contact_name: null, phone: c.phone, address: c.address }
  } else if (quote.lead_id) {
    const { data: l } = await db
      .from('leads')
      .select('id, company_name, contact_name, phone, address')
      .eq('id', quote.lead_id)
      .maybeSingle()
    if (l) client = l
  }

  const businessResult = await businessPromise
  if (!client) return null

  return { quote, client, business: businessResult.data }
})

// 탭 제목이자 'PDF로 저장' 파일명 — '한빛치과 청구서'처럼 받는 곳 이름을 붙인다.
// (거래처가 그대로 보관하는 파일이라 이름이 같으면 나중에 누구 것인지 못 찾는다)
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ doc?: string }>
}): Promise<Metadata> {
  const [{ token }, { doc }] = await Promise.all([params, searchParams])
  const data = await loadPublicQuote(token)
  return { title: buildQuoteDocTitle(data?.client.company_name, parseDocKind(doc)) }
}

// 고객 공개용 견적서/시방서/청구서 — 로그인 불필요, 공개 토큰으로만 접근
// 사장님이 '고객 링크 복사'로 만든 링크를 고객이 열면 여기로 옴
export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ doc?: string; preview?: string; m?: string }>
}) {
  const { token } = await params
  const { doc, preview, m } = await searchParams
  // 사장님이 스스로 여는 미리보기(?preview=1) — 조회 추적(고객 열람 알림) 없이, 내부 도구(링크복사·닫기) 표시
  const isOwnerPreview = preview === '1'

  const data = await loadPublicQuote(token)
  if (!data) notFound()

  const initialMode = doc === 'quote' || doc === 'spec' || doc === 'invoice' ? doc : 'both'
  // 청구 대상 월 — 사장님이 보낸 링크(?m=2026-08)만 인정. 형식이 어긋나면 이번 달로 둔다.
  const billingMonth = m && /^\d{4}-\d{2}$/.test(m) ? m : undefined

  return (
    <PrintQuote
      lead={data.client}
      quote={data.quote}
      business={data.business}
      // 사장님 미리보기(?preview=1)도 고객 페이지와 '완전히 동일하게' 렌더(variant=public).
      // 다른 건 조회 추적을 끄는 것뿐 → 인쇄 동작이 고객 페이지와 동일해짐
      variant="public"
      disableTracking={isOwnerPreview}
      publicToken={data.quote.public_token}
      initialMode={initialMode}
      today={toMarketYmd()}
      initialBillingMonth={billingMonth}
    />
  )
}
