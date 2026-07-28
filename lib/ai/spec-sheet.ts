import Anthropic from '@anthropic-ai/sdk'
import { formatAreaWithBoth } from '@/lib/utils/area'

const client = new Anthropic()

export interface SpecSheetInput {
  businessName: string
  clientName: string
  siteName: string | null
  siteAddress: string | null
  siteArea: string | null
  frequency: string | null
  workerCount: number | null
  serviceItems: string[]
  conditions: string | null
  // 'recurring' = 정기 계약(주기 있음) / 'one_off' = 일회성 작업(준공청소·외벽청소 등)
  jobType?: 'recurring' | 'one_off'
  // 미팅에서 논의된 실제 요구사항(요약/원문). 있으면 시방서가 이 내용을 따라가도록 반영
  meetingNotes?: string | null
}

export async function generateSpecSheet(input: SpecSheetInput): Promise<string> {
  const {
    businessName,
    clientName,
    siteName,
    siteAddress,
    siteArea,
    frequency,
    workerCount,
    serviceItems,
    conditions,
    jobType = 'recurring',
    meetingNotes,
  } = input

  const isOneOff = jobType === 'one_off'

  const siteInfo = [
    siteName && `현장명: ${siteName}`,
    siteAddress && `주소: ${siteAddress}`,
    siteArea && `면적: ${formatAreaWithBoth(siteArea)}`,
    !isOneOff && frequency && `청소 주기: ${frequency}`,
    workerCount && `투입 인원: ${workerCount}명`,
  ]
    .filter(Boolean)
    .join('\n')

  const jobTypeNote = isOneOff
    ? '- 작업 성격: 일회성 작업 (준공청소·외벽청소 등 1회성 시공. 정기 방문 주기 없음)'
    : '- 작업 성격: 정기 계약 (지정 주기로 반복 방문)'

  // 미팅에서 논의된 실제 요구사항이 있으면 함께 제공 (범위·방법이 이 내용을 따라가도록)
  const meetingBlock = meetingNotes?.trim()
    ? `

## 상담/미팅에서 논의된 실제 요구사항 (범위·방법에 반영)
아래는 이 고객과의 실제 상담 내용입니다. 1·2번 항목이 이 내용을 최대한 따라가도록 반영하세요.
단, "절대 금지" 규칙이 우선합니다 — 언급됐더라도 위 '청소 항목'에 없는 유료 서비스는 넣지 마세요.
"""
${meetingNotes.trim()}
"""`
    : ''

  // ── AI는 '현장마다 다른' 1·2번만 간결하게 생성 (3·4·5번은 아래 표준 문구로 자동 채움) ──
  const prompt = `당신은 청소·홈케어 전문 업체의 영업 담당자입니다.
법인 고객 제출용 청소 시방서 중 "1. 작업 대상 및 범위"와 "2. 작업 방법 및 순서" **두 항목만** 간결하게 작성하세요.
(3. 사용 약품·장비 / 4. 주기·인원 / 5. 품질 기준은 시스템이 표준 문구로 자동 추가하므로 절대 쓰지 마세요.)

## 기본 정보
- 시공 업체: ${businessName}
- 고객사: ${clientName}
${jobTypeNote}
${siteInfo}
- 청소 항목: ${serviceItems.join(', ')}
${conditions ? `- 특이사항: ${conditions}` : ''}
${meetingBlock}

## 절대 금지 (가장 중요 — 위반 금지)
- 다루는 작업은 위 '청소 항목'으로 **엄격히 한정**. 견적에 없는 서비스를 넣으면 계약 범위 분쟁이 생깁니다.
- **별도 견적이 필요한 유료·부가 서비스는 절대 추가·언급 금지** (예: 바닥 광택/왁스·코팅, 에어컨·필터 청소, 유리·외벽 청소, 카펫·소파 스팀, 방역·해충 방제, 특수 약품·장비). "선택사항·권장·추가 가능" 같은 표현으로도 끼워 넣지 마세요.
- 3·4·5번 항목(약품·장비, 주기·인원, 품질 기준)을 여기서 쓰지 마세요. 1·2번만 출력.

## 작성 규칙 (★간결하게)
- 존댓말·격식체, 순수 텍스트(마크다운 금지).
- **과도하게 길게 쓰지 말 것.** 구역·단계별로 핵심만 짧은 불릿(한두 줄)으로. 같은 말 반복·군더더기 금지.
- 1. 작업 대상 및 범위: 구역을 묶어 각 구역을 한두 줄로 요약(세부 나열 최소화). 청소 항목 범위 내에서만.
- 2. 작업 방법 및 순서: 준비 → 청소 순서 → 마무리를 간결한 순서 불릿으로.
- 제목("청소 시방서")·발주처·작성일 같은 머리말 금지(시스템이 자동 삽입). 곧바로 "1. 작업 대상 및 범위"부터.
- 문서 끝에 "끝/이상/End of Document" 같은 종료 표시 금지.

## 출력 (아래 두 항목만, 이 형식 그대로):
1. 작업 대상 및 범위
[간결한 내용]

2. 작업 방법 및 순서
[간결한 내용]`

  // 두 항목만 간결히 받으므로 max_tokens를 낮춤(과다 생성 방지). 스트리밍으로 타임아웃 방지.
  const stream = client.messages.stream({
    model: 'claude-haiku-4-5',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  })
  const message = await stream.finalMessage()

  if (message.stop_reason === 'max_tokens') {
    console.error('[SpecSheet] 1·2번 출력이 max_tokens 상한 도달')
    throw new Error('[APP] 시방서 생성 중 내용이 너무 길어졌어요. 특이사항을 조금 줄여 다시 시도해주세요')
  }

  const content = message.content[0]
  if (!content || content.type !== 'text') throw new Error('[APP] 시방서 생성에 실패했어요. 다시 시도해주세요')

  // AI가 만든 1·2번 (혹시 붙인 종료 표시·3번 이후 침범분 정리)
  const aiPart = content.text
    .trim()
    // 모델이 실수로 "3. 사용 약품..." 이후를 만들면 잘라냄(표준 문구로 대체하므로)
    .replace(/\n+\s*3\.\s*사용\s*약품[\s\S]*$/,'')
    .replace(
      /\n+\s*[-—*=[\](){}\s]*(?:end of (?:the )?(?:document|specification|spec)|\[?\s*end\s*\]?|문서\s*끝|이상\s*(?:입니다)?|끝)\s*[-—*=[\](){}.]*\s*$/i,
      '',
    )
    .trim()

  // ── 3·4·5번: 매번 동일한 표준 문구(반복 편집 제거) — 4번만 입력값으로 채움 ──
  return `${aiPart}\n\n${buildStandardSections({ isOneOff, frequency, workerCount, conditions })}`
}

// 현장 안 가리고 반복되는 3·4·5번을 고정 표준 문구로 생성(4번 주기·인원만 입력값 반영).
// 이렇게 고정하면 매번 같은 부분을 손볼 필요가 없다.
function buildStandardSections(p: {
  isOneOff: boolean
  frequency: string | null
  workerCount: number | null
  conditions: string | null
}): string {
  const worker = p.workerCount ? `${p.workerCount}명` : '현장 협의'

  const section3 = `3. 사용 약품 및 장비

모든 약품·장비는 환경 친화적이고 시설 기준에 적합한 것으로 사용합니다.

약품
- 바닥 전용 중성 세제(타일용) — 일반 바닥 청소, 물에 희석하여 사용
- 화장실용 세제 — 변기·세면대의 오염 및 냄새 제거
- 유리 클리너 — 출입문·창문·거울 등 유리 얼룩 제거

장비
- 빗자루·먼지받기, 배낭형 청소기 — 먼지·이물 제거
- 바닥용 마포 걸레 — 바닥 세정
- 변기용 브러시, 먼지떨이, 극세사 손걸레, 약품 분무용 스프레이 병
- 개인 보호 장비(장갑·마스크)

이 외 필요한 장비는 현장 상황에 맞춰 지참합니다.`

  const section4 = p.isOneOff
    ? `4. 작업 일정 및 투입 인원

- 작업 성격: 일회성 작업(1회 시공, 정기 방문 주기 없음)
- 투입 인원: ${worker}
- 예상 소요 시간: 현장 규모·오염도에 따라 변동될 수 있습니다.
- 구체 작업 일정(날짜·시간)은 고객과 사전 협의하여 확정합니다.`
    : `4. 작업 주기·빈도·투입 인원

- 작업 주기: ${p.frequency?.trim() || '월 단위 정기 청소'}
- 투입 인원: ${worker}
- 예상 소요 시간: 현장 규모·오염도·통행량에 따라 변동될 수 있습니다.
- 계약 단위: 1개월, 이후 월 단위 자동 갱신(특별한 사유가 없는 한)
- 계약 해지 시 1개월 전 통보하며, 공휴일·시설 운영 사정에 따른 일정 조정은 사전 협의합니다.`

  const section5 = `5. 품질 기준 및 특이사항

- 모든 작업은 기존 청소 품질 대비 향상을 목표로 진행합니다.
- 바닥: 얼룩·발자국·이물을 제거하고 청결 상태를 유지합니다(광택 바닥은 광택 유지).
- 유리·거울: 얼룩·자국 없는 투명한 상태를 유지합니다.
- 화장실: 위생 및 냄새 관리 상태를 유지합니다.
- 작업 종료 시 사용 도구 정리, 소등, 문단속을 확인합니다.${p.conditions?.trim() ? `\n\n[고객 요청 특이사항]\n- ${p.conditions.trim()}` : ''}`

  return `${section3}\n\n${section4}\n\n${section5}`
}
