import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { loadProposalContext } from '@/lib/proposal/load'
import { generateProposalQr } from '@/lib/proposal/qr'
import { ProposalEditor } from './proposal-editor'

export const metadata: Metadata = { title: '소개서 만들기' }

export default async function ProposalPage() {
  const ctx = await loadProposalContext()
  if (!ctx) redirect('/dashboard')

  const bizUrl = ctx.business.slug ? `https://qualio.co.kr/biz/${ctx.business.slug}?ch=proposal` : null
  const qr = bizUrl ? await generateProposalQr(bizUrl) : null

  return <ProposalEditor business={ctx.business} settings={ctx.settings} qrDataUrl={qr} />
}
