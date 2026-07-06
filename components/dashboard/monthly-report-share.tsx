'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { FileText, Copy, Check } from 'lucide-react'

interface MonthlyReportShareProps {
  businessId: string
  customerId: string
  customerName: string
}

// 거래처 월간 작업 리포트 — 공개 링크 열기/복사
// (법인 담당자에게 카톡 등으로 바로 전달하는 용도)
export function MonthlyReportShare({ businessId, customerId, customerName }: MonthlyReportShareProps) {
  const [copied, setCopied] = useState(false)

  // 이번 달(KST) 리포트 링크
  const buildUrl = () => {
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const month = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}`
    return `${window.location.origin}/q/${businessId}/monthly-report/${customerId}?month=${month}`
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildUrl())
    setCopied(true)
    toast.success(`${customerName} 이번 달 리포트 링크를 복사했어요`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex gap-2">
      <a
        href={buildUrl()}
        target="_blank"
        rel="noreferrer"
        className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
      >
        <FileText className="h-4 w-4" />
        이번 달 리포트 보기
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border border-border bg-white text-sm font-medium text-muted-foreground hover:border-emerald-300 hover:text-emerald-700 transition-colors"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? '복사됨' : '링크 복사'}
      </button>
    </div>
  )
}
