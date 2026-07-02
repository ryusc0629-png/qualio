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
  } = input

  const isOneOff = jobType === 'one_off'

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

  const prompt = `당신은 청소·홈케어 전문 업체의 영업 담당자입니다.
아래 정보를 바탕으로 법인 고객에게 제출할 **청소 시방서**를 작성해주세요.

## 기본 정보
- 시공 업체: ${businessName}
- 고객사: ${clientName}
${jobTypeNote}
${siteInfo}
- 청소 항목: ${serviceItems.join(', ')}
${conditions ? `- 특이사항: ${conditions}` : ''}

## 작성 규칙
1. 전문적이고 신뢰감 있는 문체 (존댓말, 격식체)
2. 각 항목은 번호 목록으로 명확하게 작성
3. 사용 약품·장비는 친환경·안전성 강조
4. 각 항목을 현장에서 바로 활용할 수 있을 만큼 구체적으로 작성 — 작업 범위·방법·순서·${isOneOff ? '일정' : '주기'}·수량·안전 기준 등을 빠짐없이 담을 것 (분량 제한 없음, 상세할수록 좋음)
5. 마크다운 없이 **순수 텍스트**만 출력
6. 아래 구조를 반드시 따르고, 문서를 마지막 항목까지 반드시 완결할 것 (중간에 끊지 말 것)
${isOneOff ? '7. 일회성 작업이므로 "정기 방문 주기"를 임의로 만들어 넣지 말 것 (1회 시공 기준으로 작성)' : ''}

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
  return content.text.trim()
}
