import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface NaverContentInput {
  businessName: string
  address: string | null
  geoTitle: string
  geoContent: string  // JSON 메타 블록 포함된 원본
}

interface NaverContentOutput {
  title: string
  content: string   // 마크다운 본문
  tags: string[]
}

// JSON 메타 블록 제거 후 순수 본문만 추출
function extractContent(raw: string): string {
  return raw.replace(/```json[\s\S]*?```\n?/, '').trim()
}

// GEO 최적화 글 → 네이버 SEO 최적화 글 변환
export async function generateNaverContent(
  input: NaverContentInput,
): Promise<NaverContentOutput> {
  const { businessName, address, geoTitle, geoContent } = input
  const pureContent = extractContent(geoContent)
  const region = address
    ? address.split(' ').slice(0, 2).join(' ')
    : ''

  const prompt = `당신은 네이버 블로그 SEO 전문 작가입니다.
아래 업체 정보와 기존 글을 바탕으로 네이버 검색에 최적화된 블로그 글을 작성해주세요.

업체명: ${businessName}
지역: ${region}
원본 제목: ${geoTitle}
원본 내용:
${pureContent}

네이버 SEO 블로그 글 작성 규칙:
1. 제목: 검색 키워드 2~3개를 자연스럽게 포함 (예: "${region} ${businessName} 가격 얼마? 후기 추천")
2. 분량: 1,500~2,500자
3. 구조: 공감형 서론 → H2 섹션 3~4개 → 업체 소개 + CTA 결론
4. 말투: 친근한 해요체 ("~하시면 좋아요", "~인데요", "~해보셨나요?")
5. 지역 키워드(${region})를 본문 전반에 자연스럽게 배치
6. 마지막에 ${businessName} 문의 유도 CTA 포함
7. 태그: 네이버 검색량 높은 키워드 10개 (지역명 + 서비스명 조합 위주)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "네이버 최적화 제목",
  "content": "마크다운 본문 전체",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6", "태그7", "태그8", "태그9", "태그10"]
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('네이버 콘텐츠 생성 실패: JSON 파싱 오류')

  const parsed = JSON.parse(jsonMatch[0]) as NaverContentOutput
  return parsed
}
