import Link from 'next/link'
import { BUSINESS_INFO } from '@/lib/config/business'

// 공개 페이지 공용 푸터 — 전자상거래법 사업자 정보 표시 (KCP 결제 심사 필수)
export function SiteFooter() {
  const b = BUSINESS_INFO
  return (
    <footer className="border-t mt-16">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4 text-sm text-muted-foreground">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <p className="font-semibold text-foreground">{b.serviceName}</p>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-foreground transition-colors">요금제</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">이용약관</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">개인정보처리방침</Link>
          </div>
        </div>
        <div className="space-y-1 leading-relaxed">
          <p>상호: {b.companyName} | 대표: {b.ceoName} | 사업자등록번호: {b.registrationNumber}</p>
          {b.mailOrderSalesNumber && <p>통신판매업 신고번호: {b.mailOrderSalesNumber}</p>}
          <p>사업장 주소: {b.address}</p>
          <p>고객 문의: {b.phone} | {b.email}</p>
        </div>
        <p>© 2026 {b.serviceName}. All rights reserved.</p>
      </div>
    </footer>
  )
}
