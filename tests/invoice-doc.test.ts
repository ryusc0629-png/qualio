// 청구서 한 장을 실제로 그려보고 '거래처에 나가면 안 되는 것'이 안 나가는지 확인한다.
// (계좌 미등록 경고는 사장님 화면에만, 청구 대상 월·입금 기한은 계약서와 같은 말)
// JSX 대신 createElement를 쓰는 건 테스트 파일을 .ts로 모아두는 vitest.config.mts 설정 때문.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoiceDoc } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/invoice-doc'

const items = [{ name: '사무실 정기청소', unit: '주', qty: 2, unit_price: 350000 }]

const base = {
  lead: { id: 'l1', company_name: '한빛치과', contact_name: '김담당', phone: '052-000-0000', address: '울산 남구' },
  business: {
    name: '다트클린', phone: '010-0000-0000', address: '울산 남구',
    legal_name: '다트클린', business_number: '123-45-67890', owner_name: '류승찬',
    payment_account: '국민은행 123456-78-901234 (예금주: 류승찬)',
  },
  quote: {
    id: 'abcdef12-3456', quote_number: 'Q-2026-0007', valid_until: null, items,
    total_amount: 350000, tax_included: false, conditions: null,
    site_name: '본점', site_address: '울산 남구 1', site_area: null,
    frequency: '주 2회', worker_count: 2, spec_content: null, job_type: 'recurring',
  },
  items,
  countLabel: '횟수',
  showCountCol: true,
  showUnitPriceCol: false,
  lineTotal: (it: typeof items[number]) => it.unit_price,
  subtotal: 350000,
  discountAmount: 0,
  tax: 0,
  total: 350000,
  issuedYmd: '2026-08-22',
  billingMonth: '2026-08',
  isOwnerView: true,
}

describe('청구서 렌더', () => {
  it('정기 — 청구번호·청구 대상 월·기한·계좌가 다 찍힌다', () => {
    const html = renderToStaticMarkup(createElement(InvoiceDoc, { ...base, isOneOff: false }))
    expect(html).toContain('I-202608-0007')
    expect(html).toContain('2026년 8월분')
    expect(html).toContain('2026년 9월 30일')
    expect(html).toContain('국민은행 123456-78-901234')
    expect(html).toContain('350,000원')
    expect(html).toContain('부가세 별도')
  })

  it('계좌가 없으면 사장님에게만 경고가 뜬다', () => {
    const noAccount = { ...base, business: { ...base.business, payment_account: null } }
    const owner = renderToStaticMarkup(createElement(InvoiceDoc, { ...noAccount, isOneOff: false }))
    expect(owner).toContain('입금 계좌가 아직 등록되지 않았어요')

    const customer = renderToStaticMarkup(
      createElement(InvoiceDoc, { ...noAccount, isOneOff: false, isOwnerView: false }),
    )
    expect(customer).not.toContain('입금 계좌가 아직 등록되지 않았어요')
  })

  it('일회성 — 청구 대상이 작업 이름이고 기한은 당월 말일', () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDoc, { ...base, isOneOff: true, quote: { ...base.quote, job_type: 'one_off' } }),
    )
    expect(html).toContain('I-2026-0007')
    expect(html).toContain('2026년 8월 31일')
    expect(html).not.toContain('8월분')
  })
})
