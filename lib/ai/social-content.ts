import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface SocialContentInput {
  businessName: string
  address: string | null
  geoTitle: string
  geoContent: string
}

interface SocialContentOutput {
  naverTitle: string
  naverContent: string
  naverTags: string[]
  daangn: string
  instagram: string
  instagramHashtags: string[]
}

function extractContent(raw: string): string {
  return raw.replace(/```json[\s\S]*?```\n?/, '').trim()
}

// 모델이 문자열 안에 실제 줄바꿈을 넣어 JSON이 깨지는 경우를 보정
function repairJson(raw: string): string {
  let result = ''
  let inString = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"' && raw[i - 1] !== '\\') inString = !inString
    if (inString && (ch === '\n' || ch === '\r')) {
      result += '\\n'
      continue
    }
    result += ch
  }
  return result
}

// GEO 글 → 네이버 블로그·당근마켓·인스타그램 채널 텍스트 동시 생성
// 채널들이 공개 API를 제공하지 않아, 텍스트를 만들어주면 사장님이 복사·붙여넣기 하는 반자동 방식
export async function generateSocialContent(
  input: SocialContentInput,
): Promise<SocialContentOutput> {
  const { businessName, address, geoTitle, geoContent } = input
  const pureContent = extractContent(geoContent)
  const region = address ? address.split(' ').slice(0, 2).join(' ') : '우리 동네'

  const prompt = `당신은 한국 로컬 비즈니스 마케팅 전문가입니다.
아래 청소업체 정보와 블로그 글을 바탕으로 네이버 블로그·당근마켓·인스타그램 3개 채널 버전의 글을 작성해주세요.

업체명: ${businessName}
지역: ${region}
원본 제목: ${geoTitle}
원본 내용 (요약):
${pureContent.slice(0, 1200)}

[네이버 블로그 글 작성 규칙]
- 제목: 검색에 잘 걸리는 30~40자, 지역명(${region})과 핵심 키워드 포함
- 본문: 800~1200자, 친근한 정보성 블로그 말투 ("~인데요", "~더라고요")
- 소제목 느낌으로 문단을 3~4개로 나누고, 핵심 키워드를 본문에 자연스럽게 5회 이상 반복
- 마지막 문단에 업체명(${businessName})과 상담 안내로 마무리
- 태그: 네이버 검색용 키워드 10개 (지역명+서비스 조합 위주)

[당근마켓 글 작성 규칙]
- 분량: 200~300자 (너무 길면 안 읽음)
- 말투: 동네 이웃에게 말하듯 친근하게 ("안녕하세요~", "혹시 청소 고민이신 분?")
- 지역명(${region}) 자연스럽게 1~2회 언급
- 구체적인 서비스 1~2개만 언급
- 마지막에 "채팅 주세요" 같은 CTA, 해시태그 없음

[인스타그램 글 작성 규칙]
- 본문: 100~150자, 이모지 3~5개 자연스럽게 삽입
- 청소 전후 느낌을 감성적으로 표현, 밝고 깔끔한 말투
- 마지막 CTA: "프로필 링크 클릭!" 또는 "DM 주세요!"
- 해시태그: 한국어 10개 (#지역명청소, #전문청소업체 등 검색량 높은 키워드)

반드시 아래 JSON 형식으로만 응답하세요. 문자열 안에서 줄바꿈은 \\n 으로 이스케이프하세요:
{
  "naverTitle": "네이버 블로그 제목",
  "naverContent": "네이버 블로그 본문 전체",
  "naverTags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6", "태그7", "태그8", "태그9", "태그10"],
  "daangn": "당근마켓 글 전체",
  "instagram": "인스타그램 본문 (해시태그 제외)",
  "instagramHashtags": ["해시태그1", "해시태그2", "해시태그3", "해시태그4", "해시태그5", "해시태그6", "해시태그7", "해시태그8", "해시태그9", "해시태그10"]
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('소셜 콘텐츠 생성 실패: JSON 파싱 오류')

  const parsed = JSON.parse(repairJson(jsonMatch[0])) as SocialContentOutput
  return parsed
}
