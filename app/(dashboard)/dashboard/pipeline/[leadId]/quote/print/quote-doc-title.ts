// 문서 제목 — 브라우저는 이 제목을 그대로 'PDF로 저장' 파일명으로 쓴다.
//
// 왜 거래처명을 붙이나: 제목이 '견적서·시방서'로 고정돼 있으면 거래처마다 보낸 파일이 전부 같은 이름이라
// 나중에 누구 것인지 못 찾고, 청구서를 보고 있어도 파일명은 견적서로 남는다.
// 서버(첫 화면)와 화면(탭 전환)이 같은 규칙을 쓰도록 여기 한 곳에 둔다.

export type QuoteDocKind = 'both' | 'quote' | 'spec' | 'contract' | 'invoice'

const DOC_LABELS: Record<QuoteDocKind, string> = {
  both: '견적서·시방서',
  quote: '견적서',
  spec: '시방서',
  contract: '계약서',
  invoice: '청구서',
}

/** 파일명에 못 쓰는 글자(/ \ : * ? " < > |) 제거 — 상호에 '/'가 있으면 저장이 막히거나 이름이 잘린다 */
function toFileNamePart(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** '한빛치과 청구서' — 거래처명이 없으면 문서 이름만 */
export function buildQuoteDocTitle(clientName: string | null | undefined, kind: QuoteDocKind): string {
  const who = toFileNamePart(clientName ?? '')
  return who ? `${who} ${DOC_LABELS[kind]}` : DOC_LABELS[kind]
}

/** 링크의 ?doc= 값을 문서 종류로 (모르는 값이면 견적서+시방서) */
export function parseDocKind(doc: string | undefined): QuoteDocKind {
  return doc === 'quote' || doc === 'spec' || doc === 'contract' || doc === 'invoice' ? doc : 'both'
}
