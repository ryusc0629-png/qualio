import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { OnboardingReportEditor } from '@/components/dashboard/onboarding-report-editor'
import { newOnboardingItem, type OnboardingItem } from '@/lib/onboarding/types'

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

  // ── 첫 방문 보고서에서 초안 끌어오기 ──────────────────────────
  //
  // 초도 리포트는 전부 손으로 쓰는 구조였다. 그런데 현장 직원이 첫 방문에서
  // 이미 작업 내용·특이사항·전후 사진을 앱에 적어둔다. 그걸 그대로 초안으로 깔아주면
  // 사장님은 손보기만 하면 된다. (저장된 리포트가 있으면 절대 덮어쓰지 않는다)
  let draft: { beforeNote: string; items: OnboardingItem[] } | null = null

  if (!existing) {
    // 이 계약의 가장 이른 완료 방문 1건
    const { data: firstVisit } = (await db
      .from('bookings')
      .select('id' as never)
      .eq('business_id' as never, businessId)
      .eq('contract_id' as never, contractId)
      .eq('status' as never, 'completed')
      .is('deleted_at' as never, null)
      .order('scheduled_at' as never, { ascending: true })
      .limit(1)
      .maybeSingle()) as unknown as { data: { id: string } | null }

    if (firstVisit) {
      const { data: fieldReport } = (await db
        .from('reports')
        .select('id, notes, preventive_note')
        .eq('booking_id', firstVisit.id)
        .maybeSingle()) as unknown as {
        data: { id: string; notes: string | null; preventive_note: string | null } | null
      }

      if (fieldReport) {
        const { data: photos } = (await db
          .from('report_photos')
          .select('url, type, sort_order')
          .eq('report_id', fieldReport.id)
          .order('sort_order', { ascending: true })) as unknown as {
          data: { url: string; type: string; sort_order: number }[] | null
        }

        const before = (photos ?? []).filter((p) => p.type === 'before').map((p) => p.url)
        const after  = (photos ?? []).filter((p) => p.type === 'after').map((p) => p.url)

        // 전/후 사진을 짝지어 항목으로 깐다 — 짝이 안 맞으면 있는 쪽만 채운다
        const pairCount = Math.max(before.length, after.length)
        const items: OnboardingItem[] = Array.from({ length: pairCount }, (_, i) => ({
          ...newOnboardingItem(),
          // 공간 이름은 현장에서 안 받으므로 비워둔다 — 사장님이 채우는 유일한 칸
          space: '',
          problem: i === 0 ? (fieldReport.preventive_note ?? '') : '',
          beforeUrl: before[i] ?? null,
          afterUrl: after[i] ?? null,
        }))

        const beforeNote = fieldReport.notes ?? ''
        if (beforeNote || items.length > 0) {
          draft = { beforeNote, items }
        }
      }
    }
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
          beforeNote: existing?.before_note ?? draft?.beforeNote ?? '',
          specNote: existing?.spec_note ?? '',
          managementNote: existing?.management_note ?? '',
          items: existing?.items ?? draft?.items ?? [],
          status: existing?.status ?? 'draft',
          alimtalkSentAt: existing?.alimtalk_sent_at ?? null,
          prefilled: !existing && !!draft,
        }}
      />
    </div>
  )
}
