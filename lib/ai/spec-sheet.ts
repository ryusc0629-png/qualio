import Anthropic from '@anthropic-ai/sdk'

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
  } = input

  const siteInfo = [
    siteName && `현장명: ${siteName}`,
    siteAddress && `주소: ${siteAddress}`,
    siteArea && `면적: ${siteArea}`,
    frequency && `청소 주기: ${frequency}`,
    workerCount && `투입 인원: ${workerCount}명`,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = `당신은 청소·홈케어 전문 업체의 영업 담당자입니다.
아래 정보를 바탕으로 법인 고객에게 제출할 **청소 시방서**를 작성해주세요.

## 기본 정보
- 시공 업체: ${businessName}
- 고객사: ${clientName}
${siteInfo}
- 청소 항목: ${serviceItems.join(', ')}
${conditions ? `- 특이사항: ${conditions}` : ''}

## 작성 규칙
1. 전문적이고 신뢰감 있는 문체 (존댓말, 격식체)
2. 각 항목은 번호 목록으로 명확하게 작성
3. 사용 약품·장비는 친환경·안전성 강조
4. 분량: 500~800자 내외
5. 마크다운 없이 **순수 텍스트**만 출력
6. 아래 구조를 반드시 따를 것

## 출력 구조 (이 형식 그대로):
1. 작업 대상 및 범위
[내용]

2. 작업 방법 및 순서
[내용]

3. 사용 약품 및 장비
[내용]

4. 작업 주기·빈도·투입 인원
[내용]

5. 품질 기준 및 특이사항
[내용]`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('AI 응답 오류')
  return content.text.trim()
}
