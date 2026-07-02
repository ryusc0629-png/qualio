import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PrintQuote } from './print-quote'

export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  const { leadId } = await params

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

  const [leadResult, quoteResult, businessResult] = await Promise.all([
    db
      .from('leads')
      .select('id, company_name, contact_name, phone, address')
      .eq('id', leadId)
      .eq('business_id', profile.business_id)
      .maybeSingle(),
    db
      .from('b2b_quotes')
      .select('*')
      .eq('lead_id', leadId)
      .eq('business_id', profile.business_id)
      .maybeSingle(),
    db
      .from('businesses')
      .select('name, phone, address')
      .eq('id', profile.business_id)
      .maybeSingle(),
  ])

  if (!leadResult.data || !quoteResult.data) notFound()

  // public_token은 마이그레이션으로 추가된 새 컬럼이라 타입에 아직 없음
  const publicToken = (quoteResult.data as unknown as { public_token: string | null }).public_token

  return (
    <PrintQuote
      lead={leadResult.data}
      quote={quoteResult.data}
      business={businessResult.data}
      variant="internal"
      publicToken={publicToken}
    />
  )
}
