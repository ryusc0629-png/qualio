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

  // 오늘 날짜(KST) — 모델이 임의로 2024년 등 옛 날짜를 지어내는 것을 막기 위해 명시적으로 제공
  // (Vercel 서버는 UTC라 timeZone 반드시 지정)
  const todayKst = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul',
  })

  const siteInfo = [
    siteName && `현장명: ${siteName}`,
    siteAddress && `주소: ${siteAddress}`,
    siteArea && `면적: ${formatAreaWithBoth(siteArea)}`,
    // 청소 주기는 정기 계약에만 해당 — 일회성 작업엔 넣지 않음
    !isOneOff && frequency && `청소 주기: ${frequency}`,
    workerCount && `투입 인원: ${workerCount}명`,
  ]
    .filter(Boolean)
    .join('\n')

  // 작업 유형에 따라 4번 항목 제목과 작업 성격 안내를 바꾼다.
  const jobTypeNote = isOneOff
    ? '- 작업 성격: 일회성 작업 (준공청소·외벽청소 등 1회성 시공. 정기 방문 주기 없음)'
    : '- 작업 성격: 정기 계약 (지정 주기로 반복 방문)'
  const section4Title = isOneOff ? '4. 작업 일정 및 투입 인원' : '4. 작업 주기·빈도·투입 인원'

  // 미팅에서 논의된 실제 요구사항이 있으면 함께 제공 (시방서가 이 내용을 따라가도록)
  const meetingBlock = meetingNotes?.trim()
    ? `

## 미팅에서 논의된 실제 요구사항 (반드시 반영)
아래는 이 고객과의 실제 상담/미팅 내용입니다. 시방서의 작업 범위·방법·순서·특이사항이 이 내용을 최대한 따라가도록 반영하세요.
단, 아래 "절대 금지" 규칙은 이 미팅 내용보다 우선합니다 — 미팅에서 언급됐더라도 위 '청소 항목'에 없는 유료 서비스는 시방서에 넣지 마세요.
"""
${meetingNotes.trim()}
"""`
    : ''

  const prompt = `당신은 청소·홈케어 전문 업체의 영업 담당자입니다.
아래 정보를 바탕으로 법인 고객에게 제출할 **청소 시방서**를 작성해주세요.

## 기본 정보
- 시공 업체: ${businessName}
- 고객사: ${clientName}
${jobTypeNote}
${siteInfo}
- 청소 항목: ${serviceItems.join(', ')}
${conditions ? `- 특이사항: ${conditions}` : ''}
${meetingBlock}

## 절대 금지 (가장 중요 — 어떤 경우에도 위반 금지)
- 시방서에서 다루는 작업은 위 '청소 항목'에 있는 것으로 **엄격히 한정**하세요. 견적서에 없는 서비스를 시방서에 넣으면, 고객이 계약 범위로 오해해 분쟁이 생깁니다.
- 아래처럼 **별도 견적이 필요한 유료·부가 서비스는 절대 추가하거나 언급하지 마세요** (예시이며 이에 국한되지 않음): 바닥 광택(왁스/코팅) 시공, 에어컨·필터 청소, 유리·외벽 청소, 카펫·소파 스팀 청소, 방역·해충 방제, 특수 약품·특수 장비 작업.
- "선택사항", "권장", "추가로 진행 가능", "월 1회 권장" 같은 표현으로도 위 유료 서비스를 끼워 넣지 마세요. 존재 자체를 언급하지 마세요.
- 표준 청소 순서를 설명하되, 위 '청소 항목' 범위를 벗어나는 단계·작업은 넣지 마세요.

## 작성 규칙
1. 전문적이고 신뢰감 있는 문체 (존댓말, 격식체)
2. 각 항목은 번호 목록으로 명확하게 작성
3. 사용 약품·장비는 친환경·안전성 강조 (단, 위 '청소 항목'에 필요한 것만)
4. 각 항목을 현장에서 바로 활용할 수 있을 만큼 구체적으로 작성 — 작업 범위·방법·순서·${isOneOff ? '일정' : '주기'}·수량·안전 기준 등을 빠짐없이 담을 것 (분량 제한 없음, 상세할수록 좋음)
5. 마크다운 없이 **순수 텍스트**만 출력
6. 아래 구조를 반드시 따르고, 문서를 마지막 항목까지 반드시 완결할 것 (중간에 끊지 말 것)
${isOneOff ? '7. 일회성 작업이므로 "정기 방문 주기"를 임의로 만들어 넣지 말 것 (1회 시공 기준으로 작성)' : ''}

## 머리말·날짜 규칙 (반드시 지킬 것)
- 문서 맨 위에 제목("청소 시방서" 등)·발주처·시공사·작성일 같은 머리말을 절대 넣지 마세요. 이 정보는 시스템이 문서 상단과 서명란에 자동으로 넣습니다. 곧바로 아래 '출력 구조'의 "1. 작업 대상 및 범위"부터 시작하세요.
- 날짜를 임의로 지어내지 마세요. 오늘은 ${todayKst}입니다. 문서에 날짜가 필요하면 반드시 이 날짜를 기준으로만 쓰세요.
- 문서 끝에 "End of Document", "이상", "끝", "-- 끝 --" 같은 종료 표시를 절대 넣지 마세요. 마지막 항목("5. 품질 기준 및 특이사항")의 내용으로 자연스럽게 끝내세요.

## 출력 구조 (이 형식 그대로):
1. 작업 대상 및 범위
[내용]

2. 작업 방법 및 순서
[내용]

3. 사용 약품 및 장비
[내용]

${section4Title}
[내용]

5. 품질 기준 및 특이사항
[내용]`

  // 상세한 시방서는 출력이 길어질 수 있어 max_tokens를 넉넉히 잡고 스트리밍으로 수신
  // (긴 출력에서 non-stream 요청은 HTTP 타임아웃 위험 → 스트리밍이 이를 방지)
  const stream = client.messages.stream({
    model: 'claude-haiku-4-5',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })
  const message = await stream.finalMessage()

  // 상한에 걸려 잘렸는지 확인 — 잘렸으면 그대로 반환하지 않고 오류 처리(부분 문서 방지)
  if (message.stop_reason === 'max_tokens') {
    console.error('[SpecSheet] 출력이 max_tokens 상한에 도달해 잘림')
    throw new Error('[APP] 시방서가 너무 길어 다 담지 못했어요. 특이사항을 조금 줄여 다시 시도해주세요')
  }

  const content = message.content[0]
  if (!content || content.type !== 'text') throw new Error('[APP] 시방서 생성에 실패했어요. 다시 시도해주세요')

  // 혹시 모델이 끝에 붙인 종료 표시(예: "End of Document", "이상", "끝")를 잘라냄 (안전망)
  const text = content.text
    .trim()
    .replace(
      /\n+\s*[-—*=[\](){}\s]*(?:end of (?:the )?(?:document|specification|spec)|\[?\s*end\s*\]?|문서\s*끝|이상\s*(?:입니다)?|끝)\s*[-—*=[\](){}.]*\s*$/i,
      '',
    )
    .trim()
  return text
}
