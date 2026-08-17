import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ContractForm } from './contract-form'
import { formatPhone } from '@/lib/format/phone'
import {
  DEFAULT_CONTRACT_DATA,
  type SubcontractorContractData,
} from '@/lib/contract/subcontractor-contract'
import { toMarketYmd } from '@/lib/format/datetime'
import { loadContractorSettlements } from '@/lib/finance/subcontract-load'
import { SubcontractSettlementCard } from '@/components/dashboard/finance/subcontract-settlement-card'

export const dynamic = 'force-dynamic'

// 계약서 '대표' 칸에는 이름만 들어간다 — 칸 이름이 이미 '대표'라 직함이 겹친다.
// businesses.owner_name은 홈페이지 인사말용이라 '류승찬 대표'처럼 직함이 붙어 저장된다.
const TITLE_SUFFIX = /[\s]*(대표이사|대표님|대표|사장님|사장|원장님|원장|소장님|소장|팀장|실장)$/
function stripTitle(name: string): string {
  const stripped = name.trim().replace(TITLE_SUFFIX, '').trim()
  // '대표'처럼 직함만 적혀 있으면 지우지 않는다(빈 칸이 되면 더 헷갈림)
  return stripped.length >= 2 ? stripped : name.trim()
}

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

  // 이번 달 정산 — 계약서를 쓰면 바로 여기서 도급비·내 몫이 계산돼 보인다
  const thisMonth = toMarketYmd().slice(0, 7)
  const settlements = (await loadContractorSettlements(db, businessId, thisMonth))
    .filter((s) => s.workerId === worker.id)

  // 저장된 값이 없으면 아는 정보로 빈칸을 미리 채워둔다 (사장님이 다시 타이핑하지 않게)
  const initial: SubcontractorContractData = worker.contract_data ?? {
    ...DEFAULT_CONTRACT_DATA,
    partyA: {
      company: biz?.legal_name || biz?.name || '',
      ceo:     biz?.owner_name ? stripTitle(biz.owner_name) : '',
      address: biz?.address || '',
      phone:   biz?.phone ? formatPhone(biz.phone) : '',
    },
    partyB: {
      company: worker.name,
      ceo:     '',
      address: '',
      phone:   worker.phone ? formatPhone(worker.phone) : '',
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

      <SubcontractSettlementCard month={thisMonth} items={settlements} />

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
