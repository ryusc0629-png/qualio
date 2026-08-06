import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PrintProposal } from '@/components/dashboard/print-proposal'
import { loadProposalContext } from '@/lib/proposal/load'
import { buildProposalData } from '@/lib/proposal/build'
import { generateProposalQr } from '@/lib/proposal/qr'

// 탭 제목/PDF 저장 파일명이 '무제'가 되지 않도록 서버에서 제목 고정
export const metadata: Metadata = { title: '회사 소개서' }

export default async function ProposalPrintPage() {
  const ctx = await loadProposalContext()
  if (!ctx) redirect('/dashboard/marketing/proposal')

  const data = buildProposalData(ctx.business, ctx.settings)
  const qr = data.bizUrl ? await generateProposalQr(data.bizUrl, data.theme.primaryDark) : null

  return <PrintProposal data={data} qrDataUrl={qr} variant="internal" />
}
