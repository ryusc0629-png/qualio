import { BUSINESS_INFO } from '@/lib/config/business'

// 사업자 정보 블록 — 이용약관/개인정보처리방침 하단 공용 (전자상거래법 필수 표기)
export function BusinessInfo() {
  const b = BUSINESS_INFO
  return (
    <ul className="list-none space-y-1 text-sm text-muted-foreground">
      <li>상호: {b.companyName} (서비스명: {b.serviceName})</li>
      <li>대표자: {b.ceoName}</li>
      <li>사업자등록번호: {b.registrationNumber}</li>
      {b.mailOrderSalesNumber && <li>통신판매업 신고번호: {b.mailOrderSalesNumber}</li>}
      <li>사업장 주소: {b.address}</li>
      <li>고객 문의: {b.phone} | {b.email}</li>
    </ul>
  )
}
