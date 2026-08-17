// 표준 영업·도급 파트너십 계약서 — 사장님(갑)이 자기 도급사(을)와 맺는 계약서 본문을 만든다.
//
// 조항은 코드에 고정된 표준이고, 업체는 빈칸(상호·대표·주소, 정산 방식과 금액, 분담율 등)만 채운다.
// 정산 방식(매출 배분 / 건당 / 일당)에 따라 제4조 제1항만 바뀌고 나머지 조항은 공통이다.
// 영업권 이전(11·12조)은 선택이라 빼면 이후 조 번호가 자동으로 당겨진다.

export type SettlementMode = 'revenue_share' | 'per_job' | 'per_day'

export interface ContractParty {
  company: string
  ceo: string
  address: string
  phone: string
}

export interface SubcontractorContractData {
  partyA: ContractParty          // 갑 — 영업·마케팅 담당(사장님 업체)
  partyB: ContractParty          // 을 — 도급·실행·품질 담당(도급사)
  settlementMode: SettlementMode
  sharePercent: number | null    // 매출 배분일 때 갑의 몫(%)
  unitPrice: number | null       // 건당·일당일 때 단가(원)
  closingDay: string             // 정산 마감 기준 (예: '매월 말일')
  payDay: number | null          // 익월 지급일 (예: 10 → 익월 10일)
  lossSplitPercent: number       // 공동 비용·손해의 갑 분담율(%) — 5:5면 50
  termMonths: number             // 계약 기간(개월)
  includeTransferOption: boolean // 영업권 이전 옵션 조항 포함 여부
  specialTerms: string | null    // 특약 사항
  contractDate: string | null    // 계약 체결일 'YYYY-MM-DD'
}

export interface ContractSection {
  title: string      // 예: '역할과 업무 분담'
  items: string[]    // 각 항(①②③…)의 본문. 줄바꿈으로 하위 호가 들어갈 수 있다
}

export const SETTLEMENT_LABELS: Record<SettlementMode, string> = {
  revenue_share: '매출 배분',
  per_job:       '건당 단가',
  per_day:       '일당 단가',
}

export const DEFAULT_CONTRACT_DATA: SubcontractorContractData = {
  partyA: { company: '', ceo: '', address: '', phone: '' },
  partyB: { company: '', ceo: '', address: '', phone: '' },
  settlementMode: 'revenue_share',
  sharePercent: 20,
  unitPrice: null,
  closingDay: '매월 말일',
  payDay: 10,
  lossSplitPercent: 50,
  termMonths: 12,
  includeTransferOption: true,
  specialTerms: null,
  contractDate: null,
}

const won = (n: number) => n.toLocaleString('ko-KR')

// 빈칸을 안 채웠을 때도 계약서 꼴은 유지되도록 밑줄로 대신한다(인쇄 후 손으로 적을 수 있게).
const blank = (v: string | null | undefined, width = 10) =>
  v && String(v).trim() ? String(v).trim() : '_'.repeat(width)

export function buildContractTitle(): string {
  return '영업 · 도급 파트너십 기본계약서'
}

export function buildContractPreamble(): string {
  return (
    '본 계약은 청소 용역 사업의 영업과 실행을 나누어 맡되, 단순한 하도급을 넘어 서로의 성장을 한 몸처럼 ' +
    '책임지는 동반자로서 관계를 맺기 위해 체결한다. 갑은 자신의 몫을 지속적인 거래처 창출과 판촉에 재투자하여 ' +
    '을에게 안정적인 물량을 만들고, 을은 그 물량을 흔들림 없는 품질로 완성하여 갑의 영업을 든든하게 한다. ' +
    '두 사람의 몫이 각자의 재투자로 돌아가 서로를 키우는 선순환을 이룬다. 아래 두 당사자는 상호 신뢰와 ' +
    '신의성실을 바탕으로 다음과 같이 약정한다.'
  )
}

// 제4조 제1항 — 정산 방식에 따라 문구가 바뀌는 유일한 항
function buildSettlementClause(d: SubcontractorContractData): string {
  if (d.settlementMode === 'per_job') {
    return `갑은 을이 수행한 용역 1건당 금 ${d.unitPrice ? `${won(d.unitPrice)}원` : blank(null, 8) + '원'}을 도급 대금으로 지급한다. 구체적 단가가 거래처·작업 종류에 따라 다른 경우 그 내역은 양 당사자가 별도로 정하며, 이는 본 계약의 일부를 이룬다.`
  }
  if (d.settlementMode === 'per_day') {
    return `갑은 을이 투입한 인력 1인 1일당 금 ${d.unitPrice ? `${won(d.unitPrice)}원` : blank(null, 8) + '원'}을 도급 대금으로 지급한다. 반일 투입이나 연장 근무가 있는 경우의 산정 방법은 양 당사자가 별도로 정한다.`
  }
  const a = d.sharePercent ?? 20
  return `각 거래처 용역 매출액의 ${a}퍼센트는 갑의 영업 몫으로 고정하며, 나머지 ${100 - a}퍼센트는 을에게 귀속된다.`
}

// 제4조 제2항 — 매출 배분일 때만 '갑의 몫은 순이익이 아니라 영업 활동비를 포함한 몫'임을 밝힌다
function buildShareCostClause(d: SubcontractorContractData): string | null {
  if (d.settlementMode !== 'revenue_share') return null
  const a = d.sharePercent ?? 20
  return (
    `갑의 ${a}퍼센트는 순이익이 아니라, 지속적인 거래처 창출을 위한 영업 활동비를 포함하는 몫이다. ` +
    `갑은 이 ${a}퍼센트에서 다음 각 호를 포함한 영업·판촉 비용을 스스로 부담하며, 이를 지출하고 남는 금액을 갑의 실제 이익으로 한다.\n` +
    '1. 마케팅 및 온라인·오프라인 홍보비\n' +
    '2. 홍보 콘텐츠(영상, 이미지, 게시물 등)의 기획 및 제작비\n' +
    '3. 검색 광고 등 각종 광고 집행비\n' +
    '4. 아웃바운드 영업 및 신규 거래처 발굴에 드는 비용\n' +
    '5. 거래처 접대비 및 관계 유지 비용\n' +
    '6. 그 밖에 거래처 창출과 유지에 필요한 판매관리비'
  )
}

// 제4조 제3항 — 을이 부담하는 실행 비용
function buildContractorCostClause(d: SubcontractorContractData): string {
  if (d.settlementMode === 'revenue_share') {
    const b = 100 - (d.sharePercent ?? 20)
    return `을의 ${b}퍼센트는 인건비, 자재비, 현장 운영비 등 용역 수행에 드는 제반 비용을 포함하며, 을은 이를 스스로 부담한다.`
  }
  return '위 도급 대금은 인건비, 자재비, 현장 운영비 등 용역 수행에 드는 제반 비용을 포함하며, 을은 이를 스스로 부담한다.'
}

export function buildSubcontractorContract(d: SubcontractorContractData): ContractSection[] {
  const payCycle =
    `정산 주기는 ${blank(d.closingDay, 6)} 마감, 익월 ${d.payDay ? `${d.payDay}일` : blank(null, 3) + '일'} 지급을 원칙으로 하며, ` +
    '구체적 정산 방법과 지급 계좌는 양 당사자가 별도로 정한다.'
  const loss = d.lossSplitPercent
  const lossOther = 100 - loss

  const sections: ContractSection[] = []

  sections.push({
    title: '목적',
    items: [
      '본 계약은 갑이 청소 용역 거래처를 영업하여 유치하고, 을이 그 용역을 도급받아 실제 작업을 수행하는 데 있어 양 당사자의 역할, 이익 배분, 품질 책임, 비용과 손해의 분담, 상호 협력, 그리고 장래의 영업권 이전 조건을 정함을 목적으로 한다.',
      '양 당사자는 본 계약을 단순 도급 관계가 아니라, 서로의 자립과 성장을 함께 도모하는 장기 동반자 관계로 이해하고 이행한다.',
    ],
  })

  sections.push({
    title: '정의',
    items: [
      '"거래처"란 갑이 영업 활동을 통해 유치하여 을에게 도급을 의뢰한 청소 용역 고객(법인 또는 개인)을 말한다.',
      '"용역 매출액"이란 특정 거래처로부터 청소 용역의 대가로 실제 수령한 금액(부가세 제외)을 말한다.',
      '"영업 문서"란 해당 거래처와 관련한 견적서, 시방서, 계약서, 작업 지시 및 그 밖에 영업·계약 과정에서 작성된 일체의 서류를 말한다.',
      '"완성도 기준"이란 견적서와 시방서에 기재된 작업 범위, 항목, 품질 수준을 말하며, 별도 기준이 있는 경우 그에 따른다.',
    ],
  })

  sections.push({
    title: '역할과 업무 분담',
    items: [
      '갑의 역할\n1. 거래처 영업 및 유치, 상담, 견적 협의\n2. 견적서, 시방서, 계약서 등 영업 문서의 작성 및 제공\n3. 마케팅, 홍보, 고객 관리 체계의 구축 및 지원',
      '을의 역할\n1. 갑이 유치한 거래처에 대한 청소 용역의 실제 수행\n2. 현장 인력의 배치, 관리, 교육\n3. 작업 품질의 유지 및 완성도 기준의 충족',
      '각 당사자는 자신이 맡은 역할을 선량한 관리자의 주의로써 성실히 수행하며, 상대방의 업무 수행에 필요한 정보와 협조를 지체 없이 제공한다.',
    ],
  })

  const settlementItems = [buildSettlementClause(d)]
  const shareCost = buildShareCostClause(d)
  if (shareCost) settlementItems.push(shareCost)
  settlementItems.push(buildContractorCostClause(d))
  settlementItems.push(payCycle)
  settlementItems.push(
    d.settlementMode === 'revenue_share'
      ? '매출과 정산 내역은 상호 투명하게 공개하며, 어느 일방의 요청이 있으면 관련 증빙을 열람할 수 있도록 한다.'
      : '작업 내역과 정산 내역은 상호 투명하게 공개하며, 어느 일방의 요청이 있으면 관련 증빙을 열람할 수 있도록 한다.'
  )

  sections.push({
    title: d.settlementMode === 'revenue_share' ? '매출의 배분과 영업비용의 부담' : '도급 대금과 비용의 부담',
    items: settlementItems,
  })

  sections.push({
    title: '영업 문서의 공유',
    items: [
      '갑은 각 거래처의 견적서, 시방서, 계약서 등 영업 문서 전부를 을에게 공유한다. 을은 이를 바탕으로 작업 범위와 품질 기준을 정확히 파악하여 용역을 수행한다.',
      '을 또한 작업 수행 과정에서 생성된 현장 기록, 작업 보고, 사진 등을 갑에게 공유하여 거래처 관리와 품질 확인이 가능하도록 한다.',
      '공유된 문서는 본 계약의 목적 범위 내에서만 사용하며, 비밀유지 의무를 따른다.',
    ],
  })

  sections.push({
    title: '품질 관리와 책임',
    items: [
      '용역의 품질 관리에 관한 모든 책임은 을이 부담한다. 여기에는 작업 품질의 유지, 현장 인력의 교육과 관리, 하자의 예방과 보수, 고객 불만의 1차적 처리가 포함된다.',
      '을은 견적서와 시방서에 정한 완성도 기준을 충족하도록 용역을 수행할 의무를 지며, 갑은 을의 품질 관리에 필요한 자료와 정보를 제공한다.',
    ],
  })

  sections.push({
    title: '완성도 미달 시의 책임',
    items: [
      '작업 결과가 견적서 또는 시방서에 정한 완성도 기준에서 벗어나거나 품질이 미달한 경우, 그에 대한 책임은 을이 부담한다.',
      '전항의 경우 을은 자신의 비용으로 지체 없이 재작업 또는 하자보수를 수행하며, 이로 인해 거래처에 발생한 손해 및 배상 책임도 을이 전부 부담한다.',
      '품질 미달로 인하여 거래처와의 계약이 해지되거나 매출이 감소한 경우, 갑은 그에 대해 을에게 책임을 물을 수 있다. 다만 갑이 제공한 견적서 또는 시방서 자체의 하자나 불명확함에서 비롯된 부분은 그러하지 아니하다.',
      `본 조에 따른 품질 미달 책임은 다음 조의 ${loss}대${lossOther} 분담 원칙에 우선하며, 품질 미달에서 비롯된 손해는 을이 단독으로 부담한다.`,
    ],
  })

  sections.push({
    title: '비용 투자와 손해배상의 분담',
    items: [
      `본 사업의 공동 발전을 위한 설비 투자, 공동 마케팅 비용, 신규 사업 기반 조성 등 어느 일방의 귀책과 무관한 비용의 투자는 갑이 ${loss}퍼센트, 을이 ${lossOther}퍼센트를 분담함을 원칙으로 한다.`,
      `제3자에 대한 손해배상 책임 중, 어느 당사자의 고의나 과실 또는 품질 미달에 기인하지 아니한 손해는 갑이 ${loss}퍼센트, 을이 ${lossOther}퍼센트를 분담한다.`,
      '다만 다음 각 호의 손해는 그 원인을 제공한 당사자가 단독으로 부담한다.\n1. 을의 품질 미달, 작업 과실, 인력 관리 소홀에서 비롯된 손해 : 을 부담\n2. 갑의 영업상 허위 고지, 문서상 하자에서 비롯된 손해 : 갑 부담',
      '분담 대상이 되는 비용의 투자나 손해배상은 사전에 상호 협의하여 그 범위와 금액을 정하는 것을 원칙으로 한다.',
    ],
  })

  sections.push({
    title: '영업 · 마케팅 자료의 제공과 자생 지원',
    items: [
      '갑은 을이 스스로 영업과 운영을 할 수 있는 역량을 갖추도록, 자신이 보유한 영업 및 마케팅에 관한 자료와 노하우를 아낌없이 제공한다. 여기에는 견적·시방·계약 양식, 홍보 자료, 고객 응대 방법, 마케팅 전략, 채널 운영 방법 등이 포함된다.',
      '갑은 자신이 진행하는 영업 활동의 내용과 진행 상황을 을에게 투명하게 공유하며, 을의 성장에 필요하다고 판단되는 정보를 지속적으로 전달한다.',
      '본 조는 을의 자립을 촉진하기 위한 것으로, 을은 제공받은 자료를 본 계약의 목적과 양 당사자의 공동 이익을 위해 성실히 활용한다.',
      '갑이 자신의 몫을 판촉과 마케팅에 재투자하는 것은 을에게 안정적인 거래처와 물량을 공급하기 위함이며, 을의 안정적 실행과 품질 유지는 다시 갑의 영업 기반을 강화한다. 양 당사자는 이러한 선순환이 본 파트너십의 근간임을 확인하고, 각자의 재투자와 노력이 상대방의 성장으로 이어지도록 협력한다.',
    ],
  })

  sections.push({
    title: '상호 협력 의무',
    items: [
      '갑은 을의 사업 운영과 업무 수행에 도움이 필요할 경우, 요청이 있으면 언제든 함께 참여하여 협력할 의무를 진다.',
      '갑은 을의 성장에 필요한 정보, 자료, 노하우를 전부 제공하며, 이를 이유로 별도의 대가를 청구하지 아니한다. 다만 상당한 비용이 수반되는 경우 앞 조에 따라 분담할 수 있다.',
      '을 또한 갑의 영업 활동에 필요한 현장 정보와 실적 자료를 성실히 제공하여 상호 협력한다.',
    ],
  })

  if (d.includeTransferOption) {
    sections.push({
      title: '영업권 이전 옵션',
      items: [
        '을이 앞서 정한 완성도·품질 기준을 지속적으로 충족하고, 양 당사자가 인정하는 안정적 운영 역량을 갖춘 경우, 을은 갑이 보유한 영업권(거래처 및 영업 기반 일체)을 이전받을 수 있는 우선적 권리를 가진다.',
        '전항의 "품질 기준 충족" 여부는 다음을 종합하여 판단하며, 구체적 지표는 양 당사자가 별도로 합의한다.\n1. 완성도 기준의 지속적 충족 및 하자·재작업의 최소화\n2. 거래처의 유지율 및 만족도\n3. 을의 독자적 운영·품질 관리 역량',
        '영업권 이전이 이루어지는 경우, 갑은 이전을 원활히 하기 위한 인수인계와 자료 제공에 협력한다.',
      ],
    })

    sections.push({
      title: '영업권 권리금과 지급 방식',
      items: [
        '앞 조에 따른 영업권 이전 시의 대가(권리금)는 이전 시점의 매출 규모, 거래처 가치, 기여도 등을 고려하여 양 당사자가 상호 조율하여 정한다.',
        '권리금의 지급 방식(일시금, 분할, 매출 연동 등)에 관하여도 양 당사자가 상호 조율하여 정한다.',
        '본 조의 세부 조건은 영업권 이전이 구체화되는 시점에 별도의 서면 합의로 확정하며, 그 합의는 본 계약의 일부를 이룬다.',
      ],
    })
  }

  sections.push({
    title: '비밀유지',
    items: [
      '양 당사자는 본 계약의 이행 과정에서 알게 된 상대방의 영업 비밀, 거래처 정보, 문서, 노하우를 상대방의 동의 없이 제3자에게 누설하거나 본 계약의 목적 외로 사용하지 아니한다.',
      '본 조의 의무는 계약이 종료된 후에도 2년간 유효하다.',
    ],
  })

  sections.push({
    title: '거래처 보호와 경업금지',
    items: [
      '을은 본 계약을 통해 알게 된 갑의 거래처에 대하여, 계약 기간 및 종료 후 1년간 갑의 동의 없이 직접 또는 제3자를 통하여 별도로 영업하거나 거래하지 아니한다. 다만 영업권 이전 조항에 따라 영업권을 정당하게 이전받은 경우에는 그러하지 아니하다.',
      '양 당사자는 상대방의 이익을 부당하게 침해하는 행위를 하지 아니한다.',
    ],
  })

  sections.push({
    title: '계약기간과 갱신',
    items: [
      `본 계약의 기간은 계약 체결일로부터 ${d.termMonths}개월로 한다.`,
      `기간 만료 30일 전까지 어느 일방의 서면 해지 통지가 없으면, 본 계약은 동일한 조건으로 ${d.termMonths}개월씩 자동 갱신된다.`,
    ],
  })

  sections.push({
    title: '계약의 해지',
    items: [
      '어느 당사자가 본 계약상 의무를 중대하게 위반하고, 상대방의 시정 요구를 받은 날로부터 14일 이내에 이를 시정하지 아니한 경우, 상대방은 본 계약을 해지할 수 있다.',
      '계약이 해지되더라도 이미 수행된 용역에 대한 정산, 진행 중인 거래처의 인수인계, 비밀유지, 거래처 보호에 관한 조항은 그 효력을 유지한다.',
      '계약 종료 시 양 당사자는 진행 중인 거래처에 피해가 가지 않도록 신의성실에 따라 인수인계에 협력한다.',
    ],
  })

  sections.push({
    title: '분쟁의 해결',
    items: [
      '본 계약과 관련하여 분쟁이 발생한 경우, 양 당사자는 먼저 상호 신뢰의 정신에 따라 원만한 협의로 해결하도록 노력한다.',
      '협의로 해결되지 아니하는 경우, 관할 법원은 을의 주된 사무소 소재지를 관할하는 법원으로 한다.',
    ],
  })

  const etcItems = [
    '본 계약에 정하지 아니한 사항이나 해석상 다툼이 있는 경우, 관계 법령과 상관습, 그리고 제1조에 정한 동반자 관계의 취지에 따라 양 당사자가 협의하여 정한다.',
    '본 계약의 변경은 양 당사자가 서명 또는 날인한 서면에 의하여야 한다.',
    '본 계약서는 2부를 작성하여 양 당사자가 서명 또는 날인한 후 각 1부씩 보관한다.',
  ]
  if (d.specialTerms?.trim()) {
    etcItems.push(`아래 특약사항은 본문에 우선하여 적용한다.\n${d.specialTerms.trim()}`)
  }
  sections.push({ title: '기타', items: etcItems })

  return sections
}

// 목록·카드에 한 줄로 보여줄 정산 조건 요약
export function summarizeSettlement(d: SubcontractorContractData): string {
  if (d.settlementMode === 'per_job') {
    return d.unitPrice ? `건당 ${won(d.unitPrice)}원` : '건당 단가'
  }
  if (d.settlementMode === 'per_day') {
    return d.unitPrice ? `1인 1일 ${won(d.unitPrice)}원` : '일당 단가'
  }
  const a = d.sharePercent ?? 20
  return `매출 배분 ${a}:${100 - a}`
}
