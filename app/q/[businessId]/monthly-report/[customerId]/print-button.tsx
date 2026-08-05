'use client'

import { Printer } from 'lucide-react'

// 거래처 담당자가 리포트를 PDF로 저장하거나 인쇄할 수 있게 하는 버튼.
// 서버 PDF 대신 브라우저 인쇄를 쓴다(사파리 백지 이슈 회피 + 이 코드베이스의 PrintQuote와 동일 방식).
// 인쇄 대화상자에서 '대상: PDF로 저장'을 고르면 그대로 PDF 파일이 된다.
export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 active:scale-[0.98] transition"
    >
      <Printer className="h-4 w-4" />
      PDF로 저장 · 인쇄
    </button>
  )
}
