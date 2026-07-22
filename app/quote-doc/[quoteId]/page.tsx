import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PrintQuote } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/print-quote'

// 사장님 내부 미리보기(견적서/시방서) — 대시보드 껍데기(사이드바 등) 없이 단독 렌더.
// (대시보드 레이아웃 안에 있으면 인쇄 시 스크롤 컨테이너 때문에 사파리에서 빈 페이지로 인쇄됨 →
//  공개 링크처럼 껍데기 없는 단독 페이지로 만들어 인쇄가 항상 정상 동작하도록 함)
export const metadata: Metadata = { title: '견적서·시방서' }

export default async function QuoteDocPage({
  params,
}: {
  params: Promise<{ quoteId: string }>
}) {
  const { quoteId } = await params

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

  // 내 업체 소유의 견적서만 조회 (id + business_id로 권한 확인)
  const { data: quote } = await db
    .from('b2b_quotes')
    .select('*')
    .eq('id', quoteId)
    .eq('business_id', profile.business_id)
    .maybeSingle() as unknown as {
      data: {
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
        job_type: string | null
        created_at: string | null
      } | null
    }

  if (!quote) notFound()

  const businessPromise = db
    .from('businesses')
    .select('name, phone, address')
    .eq('id', quote.business_id)
    .maybeSingle()

  // 견적서는 리드(영업 중) 또는 고객(계약 중)에 연결됨 — 어느 쪽이든 lead 형태로 맞춰 전달
  let client: { id: string; company_name: string; contact_name: string | null; phone: string | null; address: string | null } | null = null
  if (quote.customer_id) {
    const { data: c } = await db
      .from('customers')
      .select('id, name, phone, address')
      .eq('id', quote.customer_id)
      .eq('business_id', profile.business_id)
      .maybeSingle()
    if (c) client = { id: c.id, company_name: c.name, contact_name: null, phone: c.phone, address: c.address }
  } else if (quote.lead_id) {
    const { data: l } = await db
      .from('leads')
      .select('id, company_name, contact_name, phone, address')
      .eq('id', quote.lead_id)
      .eq('business_id', profile.business_id)
      .maybeSingle()
    if (l) client = l
  }

  const businessResult = await businessPromise

  if (!client) notFound()

  return (
    <PrintQuote
      lead={client}
      quote={quote}
      business={businessResult.data}
      variant="internal"
      publicToken={quote.public_token}
    />
  )
}
