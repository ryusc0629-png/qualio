import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText, CheckCircle2, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  summarizeSettlement,
  type SubcontractorContractData,
} from '@/lib/contract/subcontractor-contract'

export const dynamic = 'force-dynamic'

type ContractorRow = {
  id: string
  name: string
  /** 도급사 상호 — 이 화면은 회사와 맺은 계약을 다루므로 상호를 앞세운다 */
  company_name: string | null
  phone: string | null
  color: string
  contract_data: SubcontractorContractData | null
  contract_signed_at: string | null
}

export default async function ContractorsPage() {
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

  const { data } = await db
    .from('workers' as never)
    .select('id, name, company_name, phone, color, contract_data, contract_signed_at')
    .eq('business_id' as never, businessId)
    .eq('type' as never, 'contractor')
    .eq('is_active' as never, true)
    .order('created_at' as never) as unknown as { data: ContractorRow[] | null }

  const contractors = data ?? []
  const signedCount = contractors.filter((c) => c.contract_signed_at).length

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/schedule" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold">도급사 계약</h1>
          <p className="text-xs text-muted-foreground">
            함께 일하는 도급사와 맺는 표준 계약서예요
          </p>
        </div>
      </div>

      {contractors.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          도급사 {contractors.length}곳 중 {signedCount}곳 계약 완료
        </div>
      )}

      {contractors.length === 0 ? (
        <div className="text-center py-12 space-y-3 border rounded-xl">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">아직 등록된 도급사가 없어요</p>
          <p className="text-xs text-muted-foreground">
            일정 보드에서 &lsquo;직원/도급사 추가&rsquo;로 도급사를 먼저 등록해주세요
          </p>
          <Button asChild className="h-12">
            <Link href="/dashboard/schedule">일정 보드로 가기</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {contractors.map((c) => {
            const signed = !!c.contract_signed_at
            const drafted = !signed && !!c.contract_data

            return (
              <Link
                key={c.id}
                href={`/dashboard/contractors/${c.id}`}
                className={[
                  'block rounded-xl border p-4 transition-colors',
                  signed
                    ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-400'
                    : 'hover:border-primary/50',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                    style={{ backgroundColor: c.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{c.company_name || c.name}</p>
                      <span
                        className={[
                          'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                          signed
                            ? 'bg-emerald-600 text-white'
                            : drafted
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-muted text-muted-foreground',
                        ].join(' ')}
                      >
                        {signed ? '계약 완료' : drafted ? '작성 중' : '계약 필요'}
                      </span>
                    </div>
                    {c.phone && (
                      <p className="text-xs text-muted-foreground mt-0.5">{c.phone}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {c.contract_data
                        ? summarizeSettlement(c.contract_data)
                        : '계약서를 아직 안 썼어요'}
                      {signed && c.contract_signed_at && (
                        <>
                          {' · '}
                          {new Date(c.contract_signed_at).toLocaleDateString('ko-KR', {
                            year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul',
                          })}{' '}
                          체결
                        </>
                      )}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
