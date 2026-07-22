import Anthropic from '@anthropic-ai/sdk'

// 미팅 회의록(요약/원문) 텍스트에서 견적서·시방서 입력칸에 들어갈 항목을 뽑아낸다.
// 핵심 규칙: 회의록에 실제로 나온 내용만 채우고, 애매하면 비워둔다(지어내지 않음).

const client = new Anthropic()

export interface ExtractedQuoteFields {
  jobType: 'recurring' | 'one_off' | null
  serviceItems: { name: string; unit: string }[]
  siteName: string | null
  siteAddress: string | null
  siteArea: string | null
  frequency: string | null
  workerCount: number | null
  conditions: string | null
}

// tool_use로 받는 원시 입력(모델이 일부 항목을 생략할 수 있어 전부 optional)
interface ToolInput {
  jobType?: string
  serviceItems?: { name?: string; unit?: string }[]
  siteName?: string
  siteAddress?: string
  siteArea?: string
  frequency?: string
  workerCount?: number
  conditions?: string
}

const EMPTY: ExtractedQuoteFields = {
  jobType: null,
  serviceItems: [],
  siteName: null,
  siteAddress: null,
  siteArea: null,
  frequency: null,
  workerCount: null,
  conditions: null,
}

export async function extractQuoteFromMeeting(meetingText: string): Promise<ExtractedQuoteFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, '')
  if (!apiKey || !meetingText.trim()) return EMPTY

  const tool: Anthropic.Tool = {
    name: 'fill_quote_form',
    description: '미팅 회의록에서 청소 견적서·시방서 입력칸에 들어갈 정보를 뽑아 채운다.',
    input_schema: {
      type: 'object',
      properties: {
        jobType: {
          type: 'string',
          enum: ['recurring', 'one_off'],
          description:
            "주기적으로 반복 방문하는 정기 계약이면 'recurring', 준공청소·외벽청소처럼 1회성이면 'one_off'. 명확하지 않으면 생략.",
        },
        serviceItems: {
          type: 'array',
          description:
            '논의된 청소 서비스 항목들. 여러 공간이 나오면 각각 넣을 것(예: 사무실 정기청소, 공장동 대청소). 없으면 빈 배열.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '서비스 이름 (예: 사무실 정기청소)' },
              unit: { type: 'string', description: "청구 단위. 정기면 '월', 일회성이면 '식'. 애매하면 생략" },
            },
            required: ['name'],
          },
        },
        siteName: { type: 'string', description: '현장/건물 이름 (예: 오텍 경주 공장). 언급 없으면 생략.' },
        siteAddress: { type: 'string', description: '현장 주소. 언급 없으면 생략.' },
        siteArea: { type: 'string', description: "면적 (예: '450평' 또는 '1488㎡'). 언급 없으면 생략." },
        frequency: {
          type: 'string',
          description: "청소 주기 (예: '주 1회', '주 3회 (월수금)'). 정기 계약일 때만. 없으면 생략.",
        },
        workerCount: { type: 'number', description: '투입 인원 수(명). 언급 없으면 생략.' },
        conditions: {
          type: 'string',
          description: '계약 조건·특이사항 (예: 업무 외 시간 방문 요청, 개인 테이블은 청소 제외). 없으면 생략.',
        },
      },
      required: [],
    },
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [tool],
      // 반드시 이 도구를 호출하도록 강제 → 항상 구조화된 결과를 받는다
      tool_choice: { type: 'tool', name: 'fill_quote_form' },
      messages: [
        {
          role: 'user',
          content: `아래는 청소업체 사장님의 영업 미팅 회의록입니다. 이 내용을 바탕으로 견적서·시방서 입력칸을 채워주세요.

## 규칙
- 회의록에 실제로 나온 내용만 채울 것. 추측해서 지어내지 말 것.
- 확실하지 않은 항목은 아예 생략(빈 값)할 것. 억지로 채우지 말 것.
- 여러 공간(예: 사무동 정기청소 + 공장동 대청소)이 논의됐으면 serviceItems에 각각 나눠 넣을 것.

## 회의록
${meetingText}`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return EMPTY
    const input = block.input as ToolInput

    const jobType = input.jobType === 'recurring' || input.jobType === 'one_off' ? input.jobType : null
    const defaultUnit = jobType === 'one_off' ? '식' : '월'

    const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

    const serviceItems = Array.isArray(input.serviceItems)
      ? input.serviceItems
          .filter((it) => it && typeof it.name === 'string' && it.name.trim())
          .map((it) => ({ name: (it.name ?? '').trim(), unit: (it.unit ?? '').trim() || defaultUnit }))
      : []

    const workerCount =
      typeof input.workerCount === 'number' && input.workerCount > 0 ? Math.floor(input.workerCount) : null

    return {
      jobType,
      serviceItems,
      siteName: clean(input.siteName),
      siteAddress: clean(input.siteAddress),
      siteArea: clean(input.siteArea),
      frequency: clean(input.frequency),
      workerCount,
      conditions: clean(input.conditions),
    }
  } catch (error) {
    // 분석 실패 시 빈 결과 반환 — 폼은 그대로 두고 사용자가 직접 입력할 수 있게 함
    console.error('[ExtractQuote] 미팅 분석 실패:', error instanceof Error ? error.message : error)
    return EMPTY
  }
}
