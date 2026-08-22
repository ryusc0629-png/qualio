'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { FileText, Copy, Check } from 'lucide-react'

interface MonthlyReportShareProps {
  businessId: string
  customerId: string
  customerName: string
}

// 이번 달(KST) 리포트 경로 — 서버 렌더링에서도 계산되므로 window를 쓰지 않는다.
// 컴포넌트 밖에 두는 이유: 안에 두면 리액트가 "렌더할 때마다 값이 달라진다"고 경고한다.
function buildPath(businessId: string, customerId: string) {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const month = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}`
  return `/q/${businessId}/monthly-report/${customerId}?month=${month}`
}

// 거래처 월간 작업 리포트 — 공개 링크 열기/복사
// (법인 담당자에게 카톡 등으로 바로 전달하는 용도)
export function MonthlyReportShare({ businessId, customerId, customerName }: MonthlyReportShareProps) {
  const [copied, setCopied] = useState(false)
  const path = buildPath(businessId, customerId)

  const handleCopy = async () => {
    // 카톡으로 보낼 링크라 도메인까지 붙인다 (클릭 시점이라 window 접근이 안전)
    await navigator.clipboard.writeText(`${window.location.origin}${path}`)
    setCopied(true)
    toast.success(`${customerName} 이번 달 리포트 링크를 복사했어요`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex gap-2">
      {/* 사장님이 직접 여는 미리보기라 preview=1을 붙인다 — 계좌 미등록 같은 내부 안내가 여기서만 뜬다.
          아래 '링크 복사'는 붙이지 않는다(거래처가 받는 링크는 깨끗한 서류여야 함) */}
      <a
        href={`${path}&preview=1`}
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
