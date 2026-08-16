import { getClaude } from '@/lib/ai/client'
import { formatAreaWithBoth } from '@/lib/utils/area'


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
    const client = getClaude('spec-sheet')
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

  // ── 3·4·5번: 표준 문구(반복 편집 제거) — 작업 성격·청소 항목에 맞춰 자동 선택 ──
  return `${aiPart}\n\n${buildStandardSections({ isOneOff, frequency, workerCount, conditions, serviceItems })}`
}

// 청소 항목 텍스트로 현장 성격 판별 — 약품·장비·품질 기준을 여기에 맞춰 바꾼다.
// (실제 저장된 시방서들이 항목 성격에 따라 매번 같은 방향으로 수정돼 있어 그대로 반영)
function detectTraits(serviceItems: string[]) {
  const text = serviceItems.join(' ')
  const has = (...words: string[]) => words.some((w) => text.includes(w))
  return {
    wax:      has('왁스', '코팅'),
    polish:   has('폴리싱', '광택', '박리'),
    glass:    has('유리', '외창', '창문', '통유리'),
    postWork: has('인테리어', '준공', '입주', '분진', '리모델', '신축'),
    aircon:   has('에어컨', '실외기', '냉난방기'),
    kitchen:  has('주방', '후드', '음식점', '식당', '제빙기'),
  }
}

// 반복되는 3·4·5번을 표준 문구로 생성(주기·인원은 입력값 반영).
// 문구·약품·장비 구성은 실제 저장된 시방서에서 사장님이 매번 같은 방향으로 고친 내용을 기본값으로 삼았다.
// (예: '환경 친화적' 문구 삭제, 정기=배낭형 청소기/일회성=업소형 청소기, 일회성 5번은 '유지합니다'가 아니라 '~한 상태')
function buildStandardSections(p: {
  isOneOff: boolean
  frequency: string | null
  workerCount: number | null
  conditions: string | null
  serviceItems: string[]
}): string {
  const worker = p.workerCount ? `${p.workerCount}명` : '현장 협의'
  const t = detectTraits(p.serviceItems)

  // ── 약품: 기본 3종 + 항목 성격별 추가 ──
  const floorAgent = t.postWork
    ? '- 바닥 전용 중성 세제(데코 타일용) — 일반 바닥 청소, 물에 희석하여 사용'
    : '- 바닥 전용 중성 세제(타일용) — 일반 바닥 청소, 물에 희석하여 사용'

  const chemicals = [
    floorAgent,
    '- 화장실용 세제 — 변기·세면대의 오염 및 냄새 제거',
    `- 유리 클리너 — ${t.glass ? '출입문·창문·거울 등 유리 얼룩 제거' : '출입문 유리 얼룩 제거'}`,
    t.postWork && '- 백화제거제 — 타일 백화·분진 제거',
    (t.wax || t.polish) && '- 박리제 — 바닥 묵은 때·이물질 제거(폴리싱용)',
    t.wax && '- 바닥 왁스 — 바닥 자재 보호 및 수명 증가',
    t.kitchen && '- 물때 제거제 — 주방·캐노피 물때 및 오염 제거',
    t.aircon && '- 에어컨 전용 세제 — 물에 희석하여 사용',
  ].filter(Boolean) as string[]

  // ── 장비: 정기는 최소 구성, 일회성은 대청소 구성 + 항목별 추가 ──
  const tools = p.isOneOff
    ? ([
        t.polish || t.wax ? '- 폴리싱 장비 — 바닥 세척' : null,
        t.wax && '- 왁스용 맙리스킹',
        t.glass && '- 유리창용 폴대, 유리창용 스퀴지',
        '- 빗자루·먼지받기, 업소형 청소기 — 먼지·이물 제거',
        '- 바닥용 마포 걸레 — 바닥 세정',
        '- 바닥용 스퀴지',
        '- 연질 수세미, 청 수세미',
        t.aircon && '- 고압세척기, 세척가대, 폐수통, 보양매트, 사다리',
        '- 변기용 브러시, 먼지떨이, 극세사 손걸레, 약품 분무용 스프레이 병',
        '- 개인 보호 장비(장갑·마스크)',
      ].filter(Boolean) as string[])
    : [
        '- 배낭형 청소기 — 먼지·이물 제거',
        '- 바닥용 마포 걸레 — 바닥 세정',
        '- 변기용 브러시, 극세사 손걸레, 약품 분무용 스프레이 병',
        '- 개인 보호 장비(장갑·마스크)',
      ]

  const section3 = `3. 사용 약품 및 장비

약품·장비는 시설 기준에 적합한 것으로 사용합니다.

약품
${chemicals.join('\n')}

장비
${tools.join('\n')}

이 외 필요한 장비는 현장 상황에 맞춰 지참합니다.`

  const section4 = p.isOneOff
    ? `4. 작업 일정 및 투입 인원

- 작업 성격: 일회성 작업(1회 시공, 정기 방문 주기 없음)
- 투입 인원: ${worker}
- 예상 소요 시간: 08시 ~ 16시 (현장 규모·오염도에 따라 변동될 수 있습니다.)
- 구체 작업 일정(날짜·시간)은 고객과 사전 협의하여 확정합니다.`
    : `4. 작업 주기·빈도·투입 인원

- 작업 주기: ${p.frequency?.trim() || '월 단위 정기 청소'}
- 투입 인원: ${worker}
- 예상 소요 시간: 현장 규모·오염도·통행량에 따라 변동될 수 있습니다.
- 계약 단위: 12개월, 이후 월 단위 자동 갱신(특별한 사유가 없는 한)
- 계약 해지 시 1개월 전 통보하며, 공휴일·시설 운영 사정에 따른 일정 조정은 사전 협의합니다.`

  // ── 5번: 정기는 '계속 유지할 상태', 일회성은 '작업을 마쳤을 때 도달할 상태' 기준 ──
  // 일회성은 한 번 시공하고 끝이라 '기존 품질 대비 향상'·'유지합니다' 같은 정기청소 문장을 쓰면 안 된다.
  const goalLine = p.isOneOff
    ? t.postWork
      ? '- 모든 작업은 손걸레로 닦아도 분진이 묻어 나오지 않는 청결한 상태를 목표로 진행합니다.'
      : t.kitchen
        ? '- 모든 작업은 위생 관리 기준 이상의 청결도 확보를 목표로 진행합니다.'
        : '- 모든 작업은 자재 손상을 보호하는 선에서 청소로 낼 수 있는 최대 퀄리티를 목표로 진행합니다.'
    : '- 모든 작업은 기존 청소 품질 대비 향상을 목표로 진행합니다.'

  const quality = p.isOneOff
    ? [
        goalLine,
        `- 바닥: 얼룩·발자국·이물을 제거한 상태${t.wax ? ' (왁스는 고른 도포가 된 상태)' : ''}.`,
        '- 유리·거울: 얼룩·자국 없는 투명한 상태.',
        t.postWork
          ? '- 화장실: 타일의 분진 및 백화가 제거된 상태.'
          : '- 화장실: 물때·요석 등 묵은 오염을 제거한 상태.',
        '- 작업 종료 시 사용 도구 정리, 소등, 문단속을 확인합니다.',
      ]
    : [
        goalLine,
        '- 바닥: 얼룩·발자국·이물을 제거하고 청결 상태를 유지합니다.',
        '- 유리·거울: 얼룩·자국 없는 투명한 상태를 유지합니다.',
        '- 화장실: 위생 및 냄새 관리 상태를 유지합니다.',
        '- 작업 종료 시 사용 도구 정리, 소등, 문단속을 확인합니다.',
      ]

  const section5 = `5. 품질 기준 및 특이사항

${quality.join('\n')}${formatConditions(p.conditions)}`

  return `${section3}\n\n${section4}\n\n${section5}`
}

// 고객 요청 특이사항은 여러 줄로 입력되는 경우가 많다.
// 예전엔 전체를 한 덩어리로 붙여 사장님이 줄마다 '- '를 직접 넣어야 했으므로, 줄 단위로 자동 정리한다.
function formatConditions(conditions: string | null): string {
  const lines = (conditions ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/^[-–—•]/.test(line) ? `- ${line.replace(/^[-–—•]\s*/, '')}` : `- ${line}`))

  if (lines.length === 0) return ''
  return `\n\n[고객 요청 특이사항]\n${lines.join('\n')}`
}
