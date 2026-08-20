import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PrintActions } from './print-actions'
import {
  buildContractPreamble,
  buildContractTitle,
  buildSubcontractorContract,
  type ContractParty,
  type SubcontractorContractData,
} from '@/lib/contract/subcontractor-contract'

export const dynamic = 'force-dynamic'

type WorkerRow = {
  id: string
  name: string
  type: string
  contract_data: SubcontractorContractData | null
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

// 계약 체결일 — 저장돼 있으면 'YYYY년 M월 D일', 없으면 손으로 적을 빈칸
function formatContractDate(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '　　　　년　　　월　　　일'
  const [y, m, d] = ymd.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

// 당사자 정보 블록 — 안 채운 칸은 밑줄로 남겨 인쇄 후 손으로 적을 수 있게 한다
function PartyBlock({ role, label, party }: { role: string; label: string; party: ContractParty }) {
  const rows: [string, string][] = [
    ['상호', party.company],
    ['대표', party.ceo],
    ['주소', party.address],
    ['연락처', party.phone],
  ]

  return (
    <div>
      <p className="text-[13px] font-bold text-emerald-700 mb-2">
        {role} <span className="font-medium text-gray-600">({label})</span>
      </p>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[13px]">
            <span className="w-12 shrink-0 text-gray-500">{k}</span>
            {v?.trim() ? (
              <span className="flex-1 text-gray-900">{v}</span>
            ) : (
              <span className="flex-1 border-b border-dashed border-gray-400" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function ContractPrintPage({
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

  const { data: worker } = await db
    .from('workers' as never)
    .select('id, name, type, contract_data')
    .eq('id' as never, workerId)
    .eq('business_id' as never, businessId)
    .maybeSingle() as unknown as { data: WorkerRow | null }

  if (!worker) notFound()
  // 아직 한 번도 저장하지 않았으면 작성 화면으로 돌려보낸다
  if (!worker.contract_data) redirect(`/dashboard/contractors/${workerId}`)

  const d = worker.contract_data
  const sections = buildSubcontractorContract(d)

  return (
    <>
      <PrintActions workerId={workerId} />

      {/* A4(210mm) 문서. 폰에서는 종이 흉내를 버리고 읽기 편한 여백으로, 인쇄는 A4 그대로. */}
      {/* 브라우저가 인쇄 시 종이 가장자리에 찍는 머리글·바닥글 제거 —
          여백을 0으로 만들어 찍힐 자리를 없앤다(여백은 아래 print:p-[15mm]가 담당) */}
      <style>{`@page { size: A4; margin: 0; }`}</style>
      <div className="max-w-[210mm] mx-auto bg-white px-4 py-6 text-[14px] leading-relaxed sm:p-[20mm] print:p-[15mm] print:max-w-none font-sans text-gray-900">

        {/* 표제 */}
        <div className="text-center mb-8 print:mb-7">
          <h1 className="text-[22px] sm:text-[26px] print:text-[26px] font-bold tracking-tight">
            {buildContractTitle()}
          </h1>
          <div className="mx-auto mt-3 h-[3px] w-24 bg-emerald-600" />
        </div>

        {/* 전문 */}
        <p className="text-[13.5px] leading-[1.9] text-gray-800 mb-7 print:mb-6">
          {buildContractPreamble()}
        </p>

        {/* 당사자 */}
        <div className="rounded-lg border border-gray-300 p-5 mb-8 print:mb-7 grid grid-cols-1 gap-5 sm:grid-cols-2 print:grid-cols-2 print:gap-6 print:break-inside-avoid">
          <PartyBlock role="갑" label="영업 · 마케팅 담당" party={d.partyA} />
          <PartyBlock role="을" label="도급 · 실행 · 품질 담당" party={d.partyB} />
        </div>

        {/* 조항 */}
        <div className="space-y-5">
          {sections.map((sec, idx) => (
            <section key={sec.title} className="print:break-inside-avoid">
              <h2 className="text-[14px] font-bold mb-2 pb-1 border-b border-gray-200">
                제{idx + 1}조 ({sec.title})
              </h2>
              <div className="space-y-1.5">
                {sec.items.map((item, i) => {
                  const [head, ...subs] = item.split('\n')
                  return (
                    <div key={i} className="text-[13px] leading-[1.85]">
                      <p className="flex gap-1.5">
                        <span className="shrink-0 text-gray-600">{CIRCLED[i] ?? `(${i + 1})`}</span>
                        <span className="flex-1">{head}</span>
                      </p>
                      {subs.length > 0 && (
                        <div className="mt-1 ml-5 space-y-0.5">
                          {subs.map((s, j) => (
                            <p key={j} className="text-gray-800">{s}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {/* 서명란 */}
        <div className="mt-10 print:mt-9 print:break-inside-avoid">
          <p className="text-[13px] mb-6">
            본 계약의 성립을 증명하기 위하여 양 당사자는 아래에 서명 또는 날인한다.
          </p>

          <p className="text-[13px] mb-8">
            계약 체결일 : {formatContractDate(d.contractDate)}
          </p>

          <div className="space-y-8">
            {([
              ['갑', d.partyA],
              ['을', d.partyB],
            ] as [string, ContractParty][]).map(([role, party]) => (
              <div key={role} className="flex items-end gap-4">
                <span className="text-[15px] font-bold text-emerald-700 w-6 shrink-0">{role}</span>
                <div className="flex-1 space-y-1.5 text-[13px]">
                  <div className="flex gap-3">
                    <span className="w-12 shrink-0 text-gray-500">상호</span>
                    {party.company?.trim() ? (
                      <span>{party.company}</span>
                    ) : (
                      <span className="flex-1 border-b border-gray-400" />
                    )}
                  </div>
                  <div className="flex gap-3">
                    <span className="w-12 shrink-0 text-gray-500">대표</span>
                    {party.ceo?.trim() ? (
                      <span>{party.ceo}</span>
                    ) : (
                      <span className="flex-1 border-b border-gray-400" />
                    )}
                  </div>
                </div>
                <span className="text-[12px] text-gray-500 shrink-0 whitespace-nowrap">(서명 또는 인)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
