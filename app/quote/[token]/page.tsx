import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PrintQuote } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/print-quote'

// 탭 제목/PDF 저장 파일명이 '무제'가 되지 않도록 서버에서 제목을 명시
export const metadata: Metadata = { title: '견적서·시방서' }

// 고객 공개용 견적서/시방서 — 로그인 불필요, 공개 토큰으로만 접근
// 사장님이 '고객 링크 복사'로 만든 링크를 고객이 열면 여기로 옴
export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ doc?: string; preview?: string }>
}) {
  const { token } = await params
  const { doc, preview } = await searchParams
  // 사장님이 스스로 여는 미리보기(?preview=1) — 조회 추적(고객 열람 알림) 없이, 내부 도구(링크복사·닫기) 표시
  const isOwnerPreview = preview === '1'

  const db = createServiceClient()

  // public_token은 마이그레이션으로 추가된 새 컬럼이라 타입에 아직 없음 → 단언 사용
  const { data: quote } = await db
    .from('b2b_quotes')
    .select('*')
    .eq('public_token' as never, token)
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
        created_at: string | null
      } | null
    }

  if (!quote) notFound()

  // 견적서는 리드(영업 중) 또는 고객(계약 중)에 연결됨 — 어느 쪽이든 lead 형태로 맞춰 PrintQuote에 전달
  const businessPromise = db
    .from('businesses')
    .select('name, phone, address')
    .eq('id', quote.business_id)
    .maybeSingle()

  let client: { id: string; company_name: string; contact_name: string | null; phone: string | null; address: string | null } | null = null
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

  if (!client) notFound()

  const initialMode = doc === 'quote' || doc === 'spec' ? doc : 'both'

  return (
    <PrintQuote
      lead={client}
      quote={quote}
      business={businessResult.data}
      variant={isOwnerPreview ? 'internal' : 'public'}
      publicToken={quote.public_token}
      initialMode={initialMode}
    />
  )
}
