import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface SocialContentInput {
  businessName: string
  address: string | null
  geoTitle: string
  geoContent: string
  seoKeywords?: string[]  // 실검색량 기반 키워드(핵심+연관) — 네이버 태그 앞쪽에 우선 배치
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
  const { businessName, address, geoTitle, geoContent, seoKeywords } = input
  const pureContent = extractContent(geoContent)
  const region = address ? address.split(' ').slice(0, 2).join(' ') : '우리 동네'

  const prompt = `당신은 ${businessName}의 베테랑 청소 전문가이자, 채널별 노출 최적화에 능한 마케터입니다.
아래 블로그 글을 바탕으로 네이버 블로그·당근마켓·인스타그램 3개 채널용 글을 작성하세요.

업체명: ${businessName}
지역: ${region}
원본 제목: ${geoTitle}
원본 내용:
${pureContent.slice(0, 2500)}

[공통 작성 원칙 — 반드시 지킬 것]
1. 시점: '청소를 맡기는 고객'이 아니라 '${businessName}의 친절한 전문가' 1인칭 시점으로 쓰세요.
   - 좋은 예: "현장에서 보면 이런 경우가 많은데요, 저희는 이렇게 해결합니다"
   - 금지: "청소 고민이신가요?", "~로 고민하고 계신가요?" 같은 구매자·소비자 시점 표현
2. 전문성: 원인·진단·해결 과정을 전문가답게 설명하되, 어려운 용어는 쉽게 풀어 친절하게.
3. 스토리텔링(필수): 각 채널마다 '다른 고객의 문제를 이렇게 해결했다'는 실제 작업 사례를 1개씩 자연스럽게 녹이세요.
   - 익명·일반화로 ("얼마 전 ${region}의 한 고객님 댁은…", "최근 작업한 현장 중…")
   - 문제 상황 → 저희의 진단/조치 → 결과(개선) 흐름으로.
   - 단, 허위 통계·과장된 수치·구체적 실명/상호는 만들지 마세요 (신뢰 훼손 방지).

[네이버 블로그 — 검색 노출 최적화]
- 제목: 핵심 키워드 + 지역명(${region})을 앞쪽에 배치, 25~40자. 클릭 유도되는 구체적 표현.
- 첫 문단 1~2줄 안에 핵심 키워드를 자연스럽게 노출 (검색 스니펫·상위노출 유리).
- 본문: 1,500~2,000자 (공백 포함). 네이버 상위노출 최적 길이이므로 이 범위를 반드시 채우고, 1,500자 미만으로 끝내지 말 것. 소제목으로 문단 5~7개 구성. 핵심 키워드는 자연스럽게 6~9회 반복(키워드 남용 금지 — 저품질 처리됨).
- 서식(중요): 소제목은 반드시 '## 소제목' 형식으로 쓰고, 가장 강조할 핵심 문장 1~2개는 '> 문장' 인용구로, 꼭 기억시킬 단어는 '**단어**' 굵게로 표시하세요. (이 표기가 네이버 에디터에서 실제 소제목·인용구·굵게 서식으로 자동 변환됩니다.)
- 분량을 늘릴 땐 원인·진단·작업 과정·주의사항·자주 묻는 질문 등 정보성 내용을 추가로 풀어 쓸 것 (같은 말 반복·군더더기로 늘리지 말 것).
- 중간에 고객 해결 사례 1개 포함, 정보성·신뢰감 위주로 체류시간을 끄는 구성.
- 마지막 문단: ${businessName} 소개 + 부담 없는 상담 안내.
- 태그: 롱테일 위주 10개 (지역명+서비스 조합, 세부 증상 키워드 포함).

[당근마켓 — 동네 노출 최적화]
- 분량: 250~350자. 동네 이웃에게 건네듯 친근하지만, 전문가의 믿음직함이 드러나게.
- 지역명(${region})을 2~3회 자연스럽게 (당근은 지역 기반 노출이라 중요).
- 동네 고객 해결 사례 1개를 짧게 녹이고, 핵심 서비스 1~2개만 언급.
- 마지막에 "채팅으로 편하게 여쭤보세요" 같은 부담 없는 CTA. 해시태그 없음.

[인스타그램 — 탐색·해시태그 노출 최적화]
- 첫 줄(후킹): '더보기' 전에 노출되는 첫 문장이 핵심. 사례나 결과로 시선을 끌 것.
- 본문: 120~180자, 이모지 4~6개. 짧은 줄바꿈으로 가독성. 전문가가 현장 사례를 들려주는 톤.
- 저장·공유를 유도하는 한마디 포함 (예: "필요할 때 꺼내보게 저장해두세요").
- 마지막 CTA: "프로필 링크 클릭" 또는 "DM 주세요".
- 해시태그 12개: 대형(#청소) + 중형(#에어컨청소) + 지역소형(#${region.replace(/\\s/g, '')}청소) 믹스로 도달 극대화.

반드시 아래 JSON 형식으로만 응답하세요. 문자열 안에서 줄바꿈은 \\n 으로 이스케이프하세요:
{
  "naverTitle": "네이버 블로그 제목",
  "naverContent": "네이버 블로그 본문 전체",
  "naverTags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6", "태그7", "태그8", "태그9", "태그10"],
  "daangn": "당근마켓 글 전체",
  "instagram": "인스타그램 본문 (해시태그 제외)",
  "instagramHashtags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6", "태그7", "태그8", "태그9", "태그10", "태그11", "태그12"]
}`

  // max_tokens는 넉넉히 — 네이버 본문(~2,000자)+당근+인스타+태그 22개를 한 JSON으로 받으므로
  // 2,000으로는 응답이 중간에 잘려 JSON 파싱이 실패(채널 원고가 조용히 누락)했음. 8,000으로 상향.
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('소셜 콘텐츠 생성 실패: JSON 파싱 오류')

  const parsed = JSON.parse(repairJson(jsonMatch[0])) as SocialContentOutput

  // 태그 정규화 — 모델이 값에 '#'을 붙여 보내면 UI에서 '##'이 되므로 앞쪽 # 제거
  const cleanTags = (tags: string[]): string[] =>
    (tags ?? []).map((t) => t.replace(/^#+/, '').trim()).filter(Boolean)

  parsed.naverTags = cleanTags(parsed.naverTags)
  parsed.instagramHashtags = cleanTags(parsed.instagramHashtags)

  // 실검색량 기반 키워드가 있으면 네이버 태그 앞쪽에 우선 배치(실제 검색되는 태그) + 중복 제거, 최대 12개
  if (seoKeywords && seoKeywords.length > 0) {
    const real = cleanTags(seoKeywords)
    const merged: string[] = []
    for (const t of [...real, ...parsed.naverTags]) {
      if (t && !merged.includes(t)) merged.push(t)
    }
    parsed.naverTags = merged.slice(0, 12)
  }

  return parsed
}
