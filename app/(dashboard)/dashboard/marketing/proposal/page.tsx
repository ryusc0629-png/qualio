import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { loadProposalContext } from '@/lib/proposal/load'
import { buildProposalData } from '@/lib/proposal/build'
import { generateProposalQr } from '@/lib/proposal/qr'
import { ProposalEditor } from './proposal-editor'

export const metadata: Metadata = { title: '소개서 만들기' }

export default async function ProposalPage() {
  const ctx = await loadProposalContext()
  if (!ctx) redirect('/dashboard')

  // 미리보기 QR도 인쇄와 같은 주소를 쓴다(자체 도메인이 있으면 그 도메인)
  const { bizUrl } = buildProposalData(ctx.business, ctx.settings, ctx.extras)
  const qr = bizUrl ? await generateProposalQr(bizUrl) : null

  return <ProposalEditor business={ctx.business} settings={ctx.settings} extras={ctx.extras} qrDataUrl={qr} />
}
