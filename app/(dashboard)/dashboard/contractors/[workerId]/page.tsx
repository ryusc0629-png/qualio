import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ContractForm } from './contract-form'
import {
  DEFAULT_CONTRACT_DATA,
  type SubcontractorContractData,
} from '@/lib/contract/subcontractor-contract'

export const dynamic = 'force-dynamic'

type WorkerRow = {
  id: string
  name: string
  phone: string | null
  type: string
  contract_data: SubcontractorContractData | null
  contract_signed_at: string | null
}

type BusinessRow = {
  name: string | null
  legal_name: string | null
  owner_name: string | null
  address: string | null
  phone: string | null
}

export default async function ContractorContractPage({
  params,
}: {
  params: Promise<{ workerId: string }>
}) {
  const { workerId } = await params

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  const businessId = profile?.business_id
  if (!businessId) redirect('/onboarding')

  const [workerResult, businessResult] = await Promise.all([
    db
      .from('workers' as never)
      .select('id, name, phone, type, contract_data, contract_signed_at')
      .eq('id' as never, workerId)
      .eq('business_id' as never, businessId)
      .maybeSingle() as unknown as Promise<{ data: WorkerRow | null }>,

    db
      .from('businesses')
      .select('name, legal_name, owner_name, address, phone' as never)
      .eq('id', businessId)
      .maybeSingle() as unknown as Promise<{ data: BusinessRow | null }>,
  ])

  const worker = workerResult.data
  if (!worker) notFound()
  if (worker.type !== 'contractor') {
    // 직원에게는 도급 계약서를 쓰지 않는다 — 목록으로 돌려보낸다
    redirect('/dashboard/contractors')
  }

  const biz = businessResult.data

  // 저장된 값이 없으면 아는 정보로 빈칸을 미리 채워둔다 (사장님이 다시 타이핑하지 않게)
  const initial: SubcontractorContractData = worker.contract_data ?? {
    ...DEFAULT_CONTRACT_DATA,
    partyA: {
      company: biz?.legal_name || biz?.name || '',
      ceo:     biz?.owner_name || '',
      address: biz?.address || '',
      phone:   biz?.phone || '',
    },
    partyB: {
      company: worker.name,
      ceo:     '',
      address: '',
      phone:   worker.phone || '',
    },
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/contractors" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{worker.name} 도급 계약서</h1>
          <p className="text-xs text-muted-foreground">
            빈칸만 채우면 표준 계약서가 완성돼요
          </p>
        </div>
      </div>

      <ContractForm
        workerId={worker.id}
        workerName={worker.name}
        initial={initial}
        signedAt={worker.contract_signed_at}
        hasSaved={!!worker.contract_data}
      />
    </div>
  )
}
