import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PrintQuote } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/print-quote'

// 고객 공개용 견적서/시방서 — 로그인 불필요, 공개 토큰으로만 접근
// 사장님이 '고객 링크 복사'로 만든 링크를 고객이 열면 여기로 옴
export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ doc?: string }>
}) {
  const { token } = await params
  const { doc } = await searchParams

  const db = createServiceClient()

  // public_token은 마이그레이션으로 추가된 새 컬럼이라 타입에 아직 없음 → 단언 사용
  const { data: quote } = await db
    .from('b2b_quotes')
    .select('*')
    .eq('public_token' as never, token)
    .maybeSingle() as unknown as {
      data: {
        id: string
        lead_id: string
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
      } | null
    }

  if (!quote) notFound()

  const [leadResult, businessResult] = await Promise.all([
    db
      .from('leads')
      .select('id, company_name, contact_name, phone, address')
      .eq('id', quote.lead_id)
      .maybeSingle(),
    db
      .from('businesses')
      .select('name, phone, address')
      .eq('id', quote.business_id)
      .maybeSingle(),
  ])

  if (!leadResult.data) notFound()

  const initialMode = doc === 'quote' || doc === 'spec' ? doc : 'both'

  return (
    <PrintQuote
      lead={leadResult.data}
      quote={quote}
      business={businessResult.data}
      variant="public"
      publicToken={quote.public_token}
      initialMode={initialMode}
    />
  )
}
