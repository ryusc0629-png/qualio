import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { OnboardingReportEditor } from '@/components/dashboard/onboarding-report-editor'
import type { OnboardingItem } from '@/lib/onboarding/types'

interface PageProps {
  params: Promise<{ contractId: string }>
}

export default async function OnboardingReportPage({ params }: PageProps) {
  const { contractId } = await params

  // 인증 → business_id
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

  // 계약 + 고객
  const { data: contract } = (await db
    .from('contracts')
    .select('id, customer_id, service_type')
    .eq('id', contractId)
    .eq('business_id', businessId)
    .maybeSingle()) as unknown as {
    data: { id: string; customer_id: string; service_type: string | null } | null
  }
  if (!contract) notFound()

  const { data: customer } = await db
    .from('customers')
    .select('name')
    .eq('id', contract.customer_id)
    .maybeSingle()

  // 기존 리포트(있으면 이어서 작성)
  const { data: existing } = (await db
    .from('onboarding_reports' as never)
    .select('id, public_token, before_note, spec_note, management_note, items, status, alimtalk_sent_at')
    .eq('business_id' as never, businessId)
    .eq('contract_id' as never, contractId)
    .maybeSingle()) as unknown as {
    data: {
      id: string
      public_token: string
      before_note: string | null
      spec_note: string | null
      management_note: string | null
      items: OnboardingItem[] | null
      status: string
      alimtalk_sent_at: string | null
    } | null
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
      <Link
        href={`/dashboard/clients/${contract.customer_id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> 고객으로 돌아가기
      </Link>

      <div>
        <h1 className="text-xl font-bold">초도 진단 리포트</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          첫 작업에서 확인한 것과 앞으로의 관리를 정리해, 검토한 뒤 거래처에 카톡으로 보내요
        </p>
      </div>

      <OnboardingReportEditor
        contractId={contractId}
        businessId={businessId}
        customerName={customer?.name ?? '고객'}
        serviceType={contract.service_type}
        initial={{
          reportId: existing?.id ?? null,
          publicToken: existing?.public_token ?? null,
          beforeNote: existing?.before_note ?? '',
          specNote: existing?.spec_note ?? '',
          managementNote: existing?.management_note ?? '',
          items: existing?.items ?? [],
          status: existing?.status ?? 'draft',
          alimtalkSentAt: existing?.alimtalk_sent_at ?? null,
        }}
      />
    </div>
  )
}
