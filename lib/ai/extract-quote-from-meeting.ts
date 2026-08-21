import Anthropic from '@anthropic-ai/sdk'
import { getClaude } from '@/lib/ai/client'

// 미팅 회의록(요약/원문) 텍스트에서 견적서·시방서 입력칸에 들어갈 항목을 뽑아낸다.
// 핵심 규칙: 회의록에 실제로 나온 내용만 채우고, 애매하면 비워둔다(지어내지 않음).


export interface ExtractedQuoteFields {
  jobType: 'recurring' | 'one_off' | null
  serviceItems: { name: string; unit: string }[]
  siteName: string | null
  siteAddress: string | null
  siteArea: string | null
  frequency: string | null
  workerCount: number | null
  conditions: string | null
  // 견적서를 두 가지 안(예: 왁스 포함/미포함)으로 나눠 내기로 한 경우 각 안의 이름. 없으면 빈 배열.
  quoteVariants: string[]
}

// 이 업체가 평소 쓰는 견적 어휘 — 등록 서비스 항목과 지난 견적서에서 모은다.
// 이걸 주지 않으면 모델이 항목명을 자유 문장으로 짓고 단위도 제멋대로 붙는다.
export interface QuoteVocabulary {
  itemNames: string[]
  // 작업 유형별로 이 업체가 실제로 쓴 단위(빈도순)
  recurringUnits: string[]
  oneOffUnits: string[]
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
  quoteVariants?: string[]
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
  quoteVariants: [],
}

// 이 업체 이력이 없을 때만 쓰는 최후 기본값
const FALLBACK_RECURRING_UNIT = '월'
const FALLBACK_ONE_OFF_UNIT = '식'

// 업체 어휘를 프롬프트에 넣을 문단으로 만든다. 재료가 없으면 빈 문자열(=규칙을 붙이지 않음).
function vocabularySection(vocab: QuoteVocabulary | null): string {
  if (!vocab) return ''

  const parts: string[] = []
  if (vocab.itemNames.length > 0) {
    parts.push(`- 이 업체가 쓰는 서비스 항목 이름: ${vocab.itemNames.join(', ')}
  → 논의된 내용이 이 중 하나에 해당하면 **똑같은 이름을 그대로 쓸 것**. 해당하는 게 없을 때만 새로 지을 것.`)
  }
  if (vocab.recurringUnits.length > 0) {
    parts.push(`- 이 업체가 정기 건에 쓰는 단위: ${vocab.recurringUnits.join(', ')}`)
  }
  if (vocab.oneOffUnits.length > 0) {
    parts.push(`- 이 업체가 일회성 건에 쓰는 단위: ${vocab.oneOffUnits.join(', ')}`)
  }
  if (parts.length === 0) return ''

  return `

## 이 업체가 평소 쓰는 표현 (되도록 여기에 맞출 것)
${parts.join('\n')}
- 단위는 위 목록에서 고를 것. 목록에 마땅한 게 없을 때만 다른 단위를 쓸 것.`
}

export async function extractQuoteFromMeeting(
  meetingText: string,
  vocab: QuoteVocabulary | null = null,
): Promise<ExtractedQuoteFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, '')
  if (!apiKey || !meetingText.trim()) return EMPTY

  // 단위 설명도 이 업체가 실제로 쓰는 값으로 바꿔 준다 (예시가 곧 기본값처럼 작동하기 때문)
  const unitHint = [
    vocab?.recurringUnits.length ? `정기면 '${vocab.recurringUnits[0]}'` : `정기면 '${FALLBACK_RECURRING_UNIT}'`,
    vocab?.oneOffUnits.length ? `일회성이면 '${vocab.oneOffUnits[0]}'` : `일회성이면 '${FALLBACK_ONE_OFF_UNIT}'`,
  ].join(', ')

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
              name: {
                type: 'string',
                description:
                  '서비스 이름. 견적서에 그대로 찍히므로 20자 안쪽의 항목명으로 쓸 것(문장으로 늘여 쓰지 말 것). 상세 범위는 conditions에 넣을 것.',
              },
              unit: { type: 'string', description: `청구 단위. ${unitHint}. 애매하면 생략` },
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
        quoteVariants: {
          type: 'array',
          description:
            "견적서를 두 가지 이상의 안으로 나눠서 주기로 한 논의가 있을 때만, 각 안의 이름을 짧게(15자 이내) 넣을 것 (예: ['왁스 코팅 포함', '왁스 코팅 미포함']). 그런 논의가 없으면 생략.",
          items: { type: 'string' },
        },
      },
      required: [],
    },
  }

  try {
    const client = getClaude('extract-quote-from-meeting')
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
- 정리본과 녹음 원문이 함께 주어지면, 면적·인원·주기 같은 숫자는 **원문 쪽을 우선**해서 정확히 옮길 것.${vocabularySection(vocab)}

## 회의록
${meetingText}`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return EMPTY
    const input = block.input as ToolInput

    const jobType = input.jobType === 'recurring' || input.jobType === 'one_off' ? input.jobType : null
    // 단위를 못 정했을 때 채울 값 — 이 업체가 실제로 가장 많이 쓴 단위를 우선 사용
    const defaultUnit = jobType === 'one_off'
      ? (vocab?.oneOffUnits[0] ?? FALLBACK_ONE_OFF_UNIT)
      : (vocab?.recurringUnits[0] ?? FALLBACK_RECURRING_UNIT)

    const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

    const serviceItems = Array.isArray(input.serviceItems)
      ? input.serviceItems
          .filter((it) => it && typeof it.name === 'string' && it.name.trim())
          .map((it) => ({ name: (it.name ?? '').trim(), unit: (it.unit ?? '').trim() || defaultUnit }))
      : []

    const workerCount =
      typeof input.workerCount === 'number' && input.workerCount > 0 ? Math.floor(input.workerCount) : null

    // 안이 하나뿐이면 나눌 게 없으므로 버린다(2개 이상일 때만 의미가 있음)
    const variants = Array.isArray(input.quoteVariants)
      ? input.quoteVariants.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
      : []

    return {
      jobType,
      serviceItems,
      siteName: clean(input.siteName),
      siteAddress: clean(input.siteAddress),
      siteArea: clean(input.siteArea),
      frequency: clean(input.frequency),
      workerCount,
      conditions: clean(input.conditions),
      quoteVariants: variants.length >= 2 ? variants.slice(0, 3) : [],
    }
  } catch (error) {
    // 분석 실패 시 빈 결과 반환 — 폼은 그대로 두고 사용자가 직접 입력할 수 있게 함
    console.error('[ExtractQuote] 미팅 분석 실패:', error instanceof Error ? error.message : error)
    return EMPTY
  }
}
