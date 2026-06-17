import Anthropic from '@anthropic-ai/sdk'

/**
 * AI가 JSON 문자열 값 안에 literal 줄바꿈을 넣을 때 JSON.parse가 깨지는 문제 방지.
 */
function repairJson(raw: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === '\\') {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    if (inString) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
    }

    result += ch
  }

  return result
}

export interface PortfolioContent {
  title: string     // "강남구 A아파트 입주청소 시공 사례"
  summary: string   // 150자 이내 요약
  content: string   // 마크다운 본문
  slug: string      // URL slug
}

interface PortfolioInput {
  businessName: string
  address: string | null
  cleaningType: string
  aiReportData: {
    beforeStatus: string
    workDetails: string
    afterResult: string
    additionalNotes: string
    recommendedServices: string[]
  }
  scheduledAt: string
}

// 주소에서 개인정보 제거 — "구+단지 유형" 수준으로 마스킹
export function maskAddress(address: string): string {
  // 구/시/군 단위까지만 추출
  const guMatch = address.match(/([가-힣]+(?:시|구|군))\s*/)
  const gu = guMatch ? guMatch[1] : ''

  // 아파트/빌라/오피스텔 등 건물 유형 추출 (번지/호수 제거)
  const buildingMatch = address.match(/([가-힣A-Za-z]+(?:아파트|빌라|오피스텔|타워|빌딩|맨션|주택|단지))/)
  const building = buildingMatch ? buildingMatch[1] : ''

  if (gu && building) return `${gu} ${building}`
  if (gu) return `${gu} 일대`
  return '고객 현장'
}

// 생성된 텍스트에서 전화번호 패턴 제거 (개인정보 이중 안전장치)
function stripPhoneNumbers(text: string): string {
  return text.replace(/01[016789]-?\d{3,4}-?\d{4}/g, '***-****-****')
}

// 보고서 데이터를 기반으로 포트폴리오 시공 사례 글 자동 생성
export async function generatePortfolioContent(input: PortfolioInput): Promise<PortfolioContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('[APP] AI 기능을 사용하려면 API 키가 필요합니다')

  const client = new Anthropic({ apiKey })

  const maskedAddress = input.address ? maskAddress(input.address) : '고객 현장'
  const dateStr = new Date(input.scheduledAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long',
  })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `당신은 청소/홈케어 업체의 시공 사례 포트폴리오 글을 작성하는 전문가입니다.
아래 실제 작업 보고서 데이터를 바탕으로, 잠재 고객이 보고 "이 업체에 맡기고 싶다"고 느낄 포트폴리오 글을 작성하세요.

업체명: ${input.businessName}
서비스: ${input.cleaningType}
지역: ${maskedAddress}
시공 시기: ${dateStr}

=== 실제 작업 보고서 ===
[작업 전 상태] ${input.aiReportData.beforeStatus}
[작업 내용] ${input.aiReportData.workDetails}
[작업 결과] ${input.aiReportData.afterResult}
[참고사항] ${input.aiReportData.additionalNotes}

=== 작성 규칙 ===
1. 개인정보 절대 포함 금지: 고객 이름, 전화번호, 상세 주소(번지/호수) 절대 넣지 마세요
2. 지역은 "${maskedAddress}" 수준까지만 표시
3. 실제 작업 내용을 자연스럽게 풀어쓴 글 (800~1200자)
4. title: "지역 + 서비스 + 시공 사례" 형식 (예: "강남구 에어컨 분해세척 시공 사례")
5. summary: 이 시공의 핵심 포인트 한 줄 (130자 이내)
6. 본문 구조:
   ## 현장 상태
   (작업 전 상태를 구체적으로)
   ## 작업 과정
   (어떻게 작업했는지)
   ## 시공 결과
   (작업 후 달라진 점)
   ## 관리 팁
   (고객에게 도움되는 유지관리 조언)
7. slug: 영문 URL slug (예: "gangnam-aircon-cleaning-case")

반드시 아래 JSON 형식으로만 응답:
{
  "title": "...",
  "summary": "...",
  "content": "## 현장 상태\\n\\n본문...\\n\\n## 작업 과정\\n\\n...",
  "slug": "..."
}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON not found')
    const parsed = JSON.parse(repairJson(jsonMatch[0])) as PortfolioContent

    // 개인정보 이중 안전장치
    parsed.content = stripPhoneNumbers(parsed.content)
    parsed.title = stripPhoneNumbers(parsed.title)
    parsed.summary = stripPhoneNumbers(parsed.summary)

    return parsed
  } catch (e) {
    console.error('[AI] 포트폴리오 콘텐츠 파싱 실패:', e, text)
    throw new Error('[APP] 포트폴리오 콘텐츠 생성에 실패했습니다')
  }
}
