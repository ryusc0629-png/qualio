import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface SocialContentInput {
  businessName: string
  address: string | null
  geoTitle: string
  geoContent: string
}

interface SocialContentOutput {
  daangn: string
  instagram: string
  instagramHashtags: string[]
}

function extractContent(raw: string): string {
  return raw.replace(/```json[\s\S]*?```\n?/, '').trim()
}

// GEO 글 → 당근마켓·인스타그램 소셜 버전 동시 생성
export async function generateSocialContent(
  input: SocialContentInput,
): Promise<SocialContentOutput> {
  const { businessName, address, geoTitle, geoContent } = input
  const pureContent = extractContent(geoContent)
  const region = address ? address.split(' ').slice(0, 2).join(' ') : '우리 동네'

  const prompt = `당신은 소셜 미디어 마케팅 전문가입니다.
아래 청소업체 정보와 블로그 글을 바탕으로 당근마켓과 인스타그램 버전의 글을 작성해주세요.

업체명: ${businessName}
지역: ${region}
원본 제목: ${geoTitle}
원본 내용 (요약):
${pureContent.slice(0, 800)}

[당근마켓 글 작성 규칙]
- 분량: 200~300자 (너무 길면 안 읽음)
- 말투: 동네 이웃에게 말하듯 친근하게 ("안녕하세요~", "혹시 청소 고민이신 분?")
- 지역명(${region}) 자연스럽게 1~2회 언급
- 구체적인 서비스 1~2개만 언급 (너무 많으면 복잡해 보임)
- 마지막에 "채팅 주세요" 또는 "문의 환영해요" 같은 CTA
- 해시태그 없음

[인스타그램 글 작성 규칙]
- 본문: 100~150자, 이모지 3~5개 자연스럽게 삽입
- 청소 전후 느낌을 감성적으로 표현
- 말투: 밝고 깔끔하게 ("✨ 반짝반짝", "💪 전문가의 손길")
- 마지막 CTA: "프로필 링크 클릭!" 또는 "DM 주세요!"
- 해시태그: 한국어 10개 (#지역명청소, #전문청소업체 등 검색량 높은 키워드)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "daangn": "당근마켓 글 전체",
  "instagram": "인스타그램 본문 (해시태그 제외)",
  "instagramHashtags": ["해시태그1", "해시태그2", "해시태그3", "해시태그4", "해시태그5", "해시태그6", "해시태그7", "해시태그8", "해시태그9", "해시태그10"]
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('소셜 콘텐츠 생성 실패: JSON 파싱 오류')

  const parsed = JSON.parse(jsonMatch[0]) as SocialContentOutput
  return parsed
}
