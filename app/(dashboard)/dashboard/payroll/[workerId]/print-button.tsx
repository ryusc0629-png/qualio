'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

// 급여 명세서 인쇄 — 서버 PDF 대신 브라우저 인쇄(사파리 백지 이슈 회피).
// 앱 껍데기(사이드바·하단탭)는 dashboard-shell의 print:hidden으로 자동 제외됨.
export function PrintPayslipButton() {
  return (
    <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 print:hidden" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" />
      인쇄 · PDF 저장
    </Button>
  )
}
