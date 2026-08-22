// 견적서·시방서·계약서·청구서가 함께 쓰는 자료 모양.
// (한 장의 견적서에서 네 가지 문서가 나오므로 타입은 한 곳에 둔다)

export interface QuoteItem {
  name: string
  unit: string
  qty: number
  unit_price: number
}

/** 받는 쪽 — 리드(영업 중)와 거래처(계약 중)를 같은 모양으로 맞춰 넘긴다 */
export interface Lead {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  address: string | null
}

export interface Quote {
  id?: string
  quote_number: string | null
  valid_until: string | null
  items: unknown
  total_amount: number
  tax_included: boolean
  // 할인: 'rate'(할인율 %) | 'amount'(정액 원) | null(없음)
  discount_type?: string | null
  discount_value?: number | null
  conditions: string | null
  site_name: string | null
  site_address: string | null
  site_area: string | null
  frequency: string | null
  worker_count: number | null
  spec_content: string | null
  // 계약서 본문(사장님이 편집해 저장한 텍스트) — 없으면 표준 문안을 즉석 생성
  contract_content?: string | null
  // 정기(recurring) / 일회성(one_off) — 횟수 열 라벨 결정에 사용
  job_type?: string | null
  // 금액 입력 방식: itemized(항목별 계산) | lump(총액 직접). null=옛 견적(수량으로 추정)
  amount_mode?: string | null
  // 견적 최초 저장일 — 발행일/작성일로 사용(재열람해도 바뀌지 않게 저장값 기준)
  created_at?: string | null
}

export interface Business {
  name: string
  phone: string | null
  address: string | null
  // 을(수급자) 계약서·청구서 표기용 — 사업자 상호·사업자등록번호·대표명·입금 계좌 (신규 컬럼이라 optional)
  legal_name?: string | null
  business_number?: string | null
  owner_name?: string | null
  payment_account?: string | null
}
