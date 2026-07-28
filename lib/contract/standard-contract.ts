// 표준 용역(청소) 계약서 본문 생성 — 견적 데이터를 채운 초안 텍스트를 만든다.
// 사장님은 이 텍스트를 편집창에서 자유롭게 고칠 수 있고(=contract_content 저장),
// 저장값이 없으면 출력 시 이 함수로 즉석 생성해 보여준다(폼과 인쇄가 같은 문안을 공유).

export interface StandardContractInput {
  clientCompany: string
  isOneOff: boolean
  total: number
  taxIncluded: boolean
  frequency?: string | null
  workerCount?: number | null
  siteName?: string | null
  siteAddress?: string | null
  conditions?: string | null
}

export function buildStandardContractText(i: StandardContractInput): string {
  const amount = `${i.isOneOff ? '총' : '월'} ${i.total.toLocaleString()}원 (${i.taxIncluded ? '부가세 포함' : '부가세 별도'})`
  const workCycle = [i.frequency ?? '', i.workerCount ? `투입 ${i.workerCount}명` : '']
    .filter(Boolean)
    .join(' · ')
  const place = i.siteName && i.siteAddress
    ? `${i.siteName} (${i.siteAddress})`
    : (i.siteName || i.siteAddress || '')
  const payClause = i.isOneOff
    ? '“갑”은 용역 완료 후 “을”이 발행하는 세금계산서에 따라 대금을 “을”이 지정하는 계좌로 지급한다.'
    : '“갑”은 매월 “을”이 발행하는 세금계산서에 따라 당월 용역대금을 익월 말일까지 “을”이 지정하는 계좌로 지급한다.'

  const lines: string[] = []
  lines.push(`발주자 ${i.clientCompany}(이하 “갑”)과(와) 수급자(이하 “을”)는 아래와 같이 청소 용역 계약을 체결한다.`)
  lines.push('')
  lines.push('[ 계약 개요 ]')
  lines.push(`· 계약 금액: ${amount}`)
  lines.push('· 계약 기간:        년    월    일 부터        년    월    일 까지')
  if (workCycle) lines.push(`· 작업 주기·인원: ${workCycle}`)
  if (place) lines.push(`· 작업 장소: ${place}`)
  lines.push('')
  lines.push('제1조 (목적) 본 계약은 “갑”이 “을”에게 위탁하는 청소 용역의 수행에 관하여 양 당사자의 권리와 의무를 정함을 목적으로 한다.')
  lines.push('')
  lines.push('제2조 (용역의 내용 및 범위) 용역의 구체적 작업 대상·범위·방법은 본 계약에 첨부되는 견적서 및 시방서에 따르며, 이는 본 계약의 일부를 구성한다.')
  lines.push('')
  lines.push('제3조 (계약 기간) 계약 기간은 위 계약 개요에 정한 바에 따르며, 기간 만료 전 양 당사자의 별도 의사표시가 없으면 동일 조건으로 자동 갱신된다. 공휴일·시설 운영 사정에 따른 일정 조정은 사전 협의한다.')
  lines.push('')
  lines.push(`제4조 (계약 금액 및 지급) ${payClause}`)
  lines.push('')
  lines.push('제5조 (“을”의 의무) “을”은 선량한 관리자의 주의로 성실히 용역을 수행하며, 작업 인력에 대한 교육·관리 및 안전관리 책임을 진다.')
  lines.push('')
  lines.push('제6조 (“갑”의 의무) “갑”은 용역 수행에 필요한 장소·전기·수도 등 기본 여건을 제공하고, 정당한 사유 없이 용역 수행을 방해하지 아니한다.')
  lines.push('')
  lines.push('제7조 (손해배상) “을”은 용역 수행 중 “을”의 귀책으로 “갑”에게 발생한 손해를 배상한다.')
  lines.push('')
  lines.push('제8조 (계약의 해지) 일방이 본 계약을 위반하고 상대방의 시정 요구 후 7일 이내에 시정하지 아니한 경우 상대방은 계약을 해지할 수 있다. 또한 “갑”과 “을”은 30일 전에 상대방에게 통지하고 계약을 해지할 수 있으며, 이때 통지는 문자메시지, 카카오톡, 이메일 등 내용을 확인할 수 있는 방법으로 한다.')
  lines.push('')
  lines.push('제9조 (비밀유지) 양 당사자는 본 계약 및 용역 수행 과정에서 알게 된 상대방의 정보를 제3자에게 누설하지 아니한다.')
  lines.push('')
  lines.push('제10조 (기타) 본 계약에 정하지 아니한 사항은 관계 법령 및 상관례에 따르며, 분쟁 발생 시 상호 협의하여 해결한다. 아래 특약사항은 본문에 우선하여 적용한다.')
  lines.push('')
  lines.push('[ 특약 사항 ]')
  lines.push(i.conditions?.trim() ? i.conditions.trim() : '(없음)')

  return lines.join('\n')
}
