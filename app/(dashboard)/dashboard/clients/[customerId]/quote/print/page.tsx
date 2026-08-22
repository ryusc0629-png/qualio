import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PrintQuote } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/print-quote'
import { toMarketYmd } from '@/lib/format/datetime'

// 제목이 '무제'가 되지 않도록 하는 기본값.
// 화면이 뜨면 PrintQuote가 '거래처명 + 보고 있는 문서'(예: 한빛치과 청구서)로 바꾼다 — PDF 파일명이 그 제목이다.
export const metadata: Metadata = { title: '견적서·시방서' }

// 계약 중인 거래처(고객)용 견적서/시방서 미리보기 — 리드용 print 페이지와 동일 컴포넌트 재사용
export default async function CustomerQuotePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>
  searchParams: Promise<{ quoteId?: string }>
}) {
  const { customerId } = await params
  const { quoteId } = await searchParams

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

  // quoteId가 있으면 그 견적서를, 없으면(옛 링크 호환) 가장 최근 견적서를 보여줌
  const quoteQuery = db
    .from('b2b_quotes')
    .select('*')
    .eq('customer_id' as never, customerId)
    .eq('business_id', profile.business_id)

  const [customerResult, quoteResult, businessResult] = await Promise.all([
    db
      .from('customers')
      .select('id, name, phone, address')
      .eq('id', customerId)
      .eq('business_id', profile.business_id)
      .maybeSingle(),
    quoteId
      ? quoteQuery.eq('id', quoteId).maybeSingle()
      : quoteQuery.order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // 계약서 '을' 정보·청구서 입금 계좌까지 함께 — 신규 컬럼이라 타입 단언으로 받는다
    db
      .from('businesses')
      .select('name, phone, address, legal_name, business_number, owner_name, payment_account' as never)
      .eq('id', profile.business_id)
      .maybeSingle() as unknown as Promise<{ data: { name: string; phone: string | null; address: string | null; legal_name: string | null; business_number: string | null; owner_name: string | null; payment_account: string | null } | null }>,
  ])

  if (!customerResult.data || !quoteResult.data) notFound()

  // PrintQuote는 lead 형태({id, company_name, contact_name, phone, address})를 기대 → 고객을 매핑
  const c = customerResult.data
  const leadShaped = {
    id: c.id,
    company_name: c.name,
    contact_name: null,
    phone: c.phone,
    address: c.address,
  }

  // public_token은 마이그레이션으로 추가된 새 컬럼이라 타입에 아직 없음
  const publicToken = (quoteResult.data as unknown as { public_token: string | null }).public_token

  return (
    <PrintQuote
      lead={leadShaped}
      quote={quoteResult.data}
      business={businessResult.data}
      variant="internal"
      publicToken={publicToken}
      today={toMarketYmd()}
    />
  )
}
