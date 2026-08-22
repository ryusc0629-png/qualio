import { describe, it, expect } from 'vitest'
import {
  buildQuoteDocTitle,
  parseDocKind,
} from '@/app/(dashboard)/dashboard/pipeline/[leadId]/quote/print/quote-doc-title'

// 이 제목이 곧 거래처가 받아 보관하는 PDF 파일명이다.

describe('문서 제목(=PDF 파일명)', () => {
  it('거래처명 + 문서 이름으로 나온다', () => {
    expect(buildQuoteDocTitle('한빛치과', 'quote')).toBe('한빛치과 견적서')
    expect(buildQuoteDocTitle('한빛치과', 'spec')).toBe('한빛치과 시방서')
    expect(buildQuoteDocTitle('한빛치과', 'invoice')).toBe('한빛치과 청구서')
    expect(buildQuoteDocTitle('한빛치과', 'contract')).toBe('한빛치과 계약서')
    expect(buildQuoteDocTitle('한빛치과', 'both')).toBe('한빛치과 견적서·시방서')
  })

  it('파일명에 못 쓰는 글자가 상호에 있어도 저장이 막히지 않는다', () => {
    expect(buildQuoteDocTitle('한빛치과/서울점', 'quote')).toBe('한빛치과 서울점 견적서')
    expect(buildQuoteDocTitle('  한빛  치과  ', 'invoice')).toBe('한빛 치과 청구서')
  })

  it('거래처명이 없으면 문서 이름만 (제목이 비어 무제가 되지 않게)', () => {
    expect(buildQuoteDocTitle(null, 'invoice')).toBe('청구서')
    expect(buildQuoteDocTitle('', 'quote')).toBe('견적서')
  })

  it('모르는 ?doc= 값은 견적서+시방서로 본다', () => {
    expect(parseDocKind('invoice')).toBe('invoice')
    expect(parseDocKind(undefined)).toBe('both')
    expect(parseDocKind('아무거나')).toBe('both')
  })
})
