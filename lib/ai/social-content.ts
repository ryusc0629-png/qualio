import Anthropic from '@anthropic-ai/sdk'
import { naturalRegionLabel } from '@/lib/address/parse-region'

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
  daangnTitle: string  // 당근 목록·미리보기에서 제목처럼 노출되는 첫 줄(네이버 제목과 동일 역할)
  daangn: string
  instagram: string
  instagramHashtags: string[]
  ctaQuestion: string  // 글 주제 맞춤 견적 유도 질문(예: "우리 에어컨 청소 비용은 얼마일까요?")
}

// ctaQuestion을 모델이 비워서 보낼 때를 대비한 결정적 폴백 — 글 제목 키워드로 주제 치환
function fallbackCtaQuestion(title: string): string {
  const t = title ?? ''
  const appliance = ['에어컨', '세탁기', '냉장고', '소파', '매트리스', '침대'].find((a) => t.includes(a))
  if (appliance) return `우리 ${appliance} 청소 비용은 얼마일까요?`
  if (/매장|상가|사무실|오피스|상업|점포|병원|의원|카페|식당/.test(t)) return '우리 매장 청소 비용은 얼마일까요?'
  return '우리 집 청소 비용은 얼마일까요?'
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
  // 자연 검색형 지역명("울산 울주군") — 행정 정식명("울산광역시 울주군")은 검색어와 안 맞고 제목 앞자리를 낭비
  const region = naturalRegionLabel(address) ?? '우리 동네'

  const prompt = `당신은 ${businessName}의 베테랑 청소 전문가입니다.
아래 '원본 블로그 글'을 네이버 블로그·당근마켓·인스타그램 3개 채널 형식에 맞게 '각색'하세요.

★★대전제(가장 중요): 원본 글은 이미 품질이 좋습니다. 새 글을 창작하는 게 아니라, 이 원본을 각 채널 형식에 맞게 옮기는 작업입니다.
- 원본의 주제·핵심 내용·정보·논리 전개·전문성·톤을 그대로 살리세요. 원본의 소제목·핵심 포인트·결론을 유지하세요.
- 새로운 주제·새로운 각도·새로운 후킹을 지어내지 마세요. 원본에 없는 사실·수치·사례·고객 이야기를 새로 만들지 마세요.
- 채널별로 바꾸는 것은 오직 '형식'뿐입니다: 길이, 서식, 제목, 플랫폼 톤, 노출용 키워드/해시태그.

업체명: ${businessName}
지역: ${region}
원본 제목: ${geoTitle}
원본 내용:
${pureContent.slice(0, 2500)}

[공통 작성 원칙 — 반드시 지킬 것]
0. ★주제 고정(가장 중요): 채널 글은 반드시 위 '원본 제목·원본 내용'의 주제·범위를 그대로 유지하세요. 원본에 여러 서비스(에어컨·냉장고·입주·정기 등)가 언급돼 있어도, 그중 하나(예: 에어컨)를 골라 글 전체를 그 서비스 글로 좁히지 마세요. 원본이 '업체 추천·여러 서비스 개요'처럼 포괄적이면 채널 글도 그 포괄 주제를 유지하세요. 원본이 실제로 에어컨 글이면 에어컨으로 쓰는 게 맞습니다 — 요점은 '원본 주제·범위를 벗어나지 말 것'.
1. 시점: '청소를 맡기는 고객'이 아니라 '${businessName}의 친절한 전문가' 1인칭 시점으로 쓰세요.
   - 좋은 예: "현장에서 보면 이런 경우가 많은데요, 저희는 이렇게 해결합니다"
   - 금지: "청소 고민이신가요?", "~로 고민하고 계신가요?" 같은 구매자·소비자 시점 표현
2. 전문성: 원인·진단·해결 과정을 전문가답게 설명하되, 어려운 용어는 쉽게 풀어 친절하게.
3. 사례·근거: 원본 글에 담긴 사례·설명·근거를 그대로 활용하세요. 원본에 없는 고객 이야기·통계·수치를 새로 지어내지 마세요(각색이지 창작이 아님). 원본에 사례가 없으면 억지로 만들지 말고 원본의 설명을 채널 길이에 맞게 풀거나 줄이세요.
4. 설득 구조(필승 동선): 글은 '후킹(시선 잡기) → 문제 제기(내 얘기네) → 공감(다들 그래요) → 해결(저희는 이렇게 다릅니다) → 신뢰(실제 사례·보장) → 제안(부담 없는 다음 행동)' 순서로 흐르게 쓰세요. 짧은 글(당근·인스타)은 최소 '문제 → 해결 → 제안'만은 지키세요.
5. 본능 자극: 이 글 주제에 맞는 '본능 버튼' 2~3개를 골라 자연스럽게 건드리세요 — 불안·공포(방치하면 더 커지는 문제), 안전·위생(건강·아이·직원), 편리함(맡기면 본업에 집중), 사회적 인정(이미 많은 곳이 함께함), 리스크 제거(재작업·환불 보장), 즉시성(빠른 시작). ※희소성·과장 후킹은 절제하고, 낚시 표현(무조건·100%·충격·소름)과 허위 수치는 절대 금지.
6. 고객 언어: 특징이 아니라 '고객이 얻는 이익'으로 말하세요("10년 경력"이 아니라 "어떤 상황도 안전하게 마무리"). 중학생도 이해할 쉬운 말로.

[네이버 블로그 — 검색 노출 최적화]
- 제목(가장 중요 — SEO와 후킹을 동시에):
  · SEO: 앞 15자 안에 '지역명(${region}) + 핵심 키워드'를 문장 속에 자연스럽게 녹일 것(제목 앞부분이 검색 가중치가 높음). 지역명은 '${region}'처럼 사람들이 실제 검색창에 치는 형태로 쓰고, '울산광역시' 같은 딱딱한 행정 정식명칭은 쓰지 말 것.
  · 후킹: 그 위에 아래 장치를 최소 1개 얹어 클릭을 유발할 것 — ①구체적 증상("냄새·바람 약해짐") ②흔한 오해 반박("필터만 닦으면 안 되는 이유") ③비용·결과 궁금증("얼마나 깨끗해질까").
  · 분량: 전체 25~40자.
  · 금지(중요): (1) '[지역명]'처럼 대괄호로 지역을 제목 맨 앞에 붙이는 고정 접두사 형식 절대 금지 — 모든 글이 똑같은 틀로 보여 네이버가 대량생산·유사문서로 판단, 상위노출에 불리함. 지역명은 반드시 제목 문장 속에 자연스럽게 섞고, 글마다 문장 구조를 다르게 할 것. (2) 과장·낚시성 표현(무조건·100%·충격·소름 등)과 허위 수치 — 네이버 저품질 처리됨.
  · 예: "${region} 정기청소, 직원이 직접 하면 안 되는 3가지 이유" / "${region} 상가청소, 바닥보다 주방 후드가 먼저인 이유"
- ★각색 원칙: 네이버 본문은 원본 글의 구성(소제목 순서)·핵심 포인트·정보·전문성을 거의 그대로 살리세요. 다만 원본 문장을 토씨까지 똑같이 복사하지는 말고, 같은 내용을 자연스럽게 다른 표현으로 다듬으세요(웹사이트 원문과 100% 동일하면 네이버가 중복문서로 보아 저품질 처리됨). 내용을 바꾸지 말고 표현만 바꾸는 것입니다.
- 첫 문단 1~2줄 안에 핵심 키워드를 자연스럽게 노출 (검색 스니펫·상위노출 유리).
- 본문: 원본 분량에 준하도록 1,500~2,000자 이상(공백 포함) 충실히 채우고, 1,500자 미만으로 끝내지 말 것. 원본 소제목을 살려 문단 5~7개 구성. 핵심 키워드는 자연스럽게 6~9회 반복(키워드 남용 금지 — 저품질 처리됨).
- 서식(중요): 소제목은 반드시 '## 소제목' 형식으로 쓰고, 가장 강조할 핵심 문장 1~2개는 '> 문장' 인용구로, 꼭 기억시킬 단어는 '**단어**' 굵게로 표시하세요. (이 표기가 네이버 에디터에서 실제 소제목·인용구·굵게 서식으로 자동 변환됩니다.)
- 분량을 늘릴 땐 원인·진단·작업 과정·주의사항·자주 묻는 질문 등 정보성 내용을 추가로 풀어 쓸 것 (같은 말 반복·군더더기로 늘리지 말 것).
- 중간에 고객 해결 사례 1개 포함, 정보성·신뢰감 위주로 체류시간을 끄는 구성.
- 마지막 문단: ${businessName} 소개 + 부담 없는 상담 안내.
- 태그: 롱테일 위주 10개 (지역명+서비스 조합, 세부 증상 키워드 포함).

[당근마켓 — 동네 노출 최적화]
- 제목(daangnTitle — 가장 중요): 스크롤을 멈추게 하는 한 줄. 당근 목록·미리보기에서 이 줄이 제목처럼 노출되므로 여기서 승부남. 반드시 daangnTitle 필드에 따로 담고, 본문(daangn) 안에서 다시 반복하지 말 것.
  · '지역명(${region}) + 서비스 키워드'를 넣되(동네 검색 노출), 증상·결과·궁금증으로 후킹. 20~35자.
  · "안녕하세요, ${businessName}입니다" 같은 밋밋한 인사 금지 — 업체 소개·인사는 본문 뒤로 미룰 것.
  · 예: "${region}에서 에어컨 켤 때 쿰쿰한 냄새 나셨다면 꼭 보세요" / "${region} 상가 사장님, 청소 견적 전에 이것부터 확인하세요"
- 본문(daangn): 250~350자. 제목에 이어지는 내용으로 자연스럽게 시작하되 제목 문장을 그대로 반복하지 말 것. 동네 이웃에게 건네듯 친근하지만, 전문가의 믿음직함이 드러나게.
- 지역명(${region})을 2~3회 자연스럽게 (당근은 지역 기반 노출이라 중요).
- 원본 글의 핵심(문제 → 해결 → 결과)을 짧게 압축해 담을 것. 원본에 없는 사례는 지어내지 말 것.
- 마지막에 "채팅으로 편하게 여쭤보세요" 같은 부담 없는 CTA. 해시태그 없음.

[인스타그램 — 탐색·해시태그 노출 최적화]
- 첫 줄(후킹): '더보기' 전에 노출되는 첫 문장이 핵심. 원본의 핵심 포인트나 결과로 시선을 끌 것(원본에 없는 내용 창작 금지).
- 본문: 120~180자, 이모지 4~6개. 짧은 줄바꿈으로 가독성. 원본 내용을 짧게 압축한 전문가 톤.
- 저장·공유를 유도하는 한마디 포함 (예: "필요할 때 꺼내보게 저장해두세요").
- 마지막 CTA: "프로필 링크 클릭" 또는 "DM 주세요".
- 해시태그 정확히 5개(인스타 캡션 제한): 대형(#청소) + 중형(#에어컨청소) + 지역소형(#${region.replace(/\\s/g, '')}청소) 믹스로 도달 극대화. 5개를 넘기지 말 것.

[견적 유도 질문 — ctaQuestion]
- 이 글 주제에 딱 맞춰 독자의 궁금증을 자극하는 짧은 질문 1개. 형식: "우리 OO 청소 비용은 얼마일까요?"
- OO는 이 글의 주제로 치환: 집·입주·이사 청소글→"집", 상가·사무실·매장·상업공간 청소글→"매장", 에어컨글→"에어컨", 세탁기글→"세탁기", 냉장고글→"냉장고" 등.
- 고객 유형이 분명하면 그에 맞게(가정=집, 상업=매장/사무실). 15~25자, 반드시 물음표로 끝낼 것.

반드시 아래 JSON 형식으로만 응답하세요. 문자열 안에서 줄바꿈은 \\n 으로 이스케이프하세요:
{
  "naverTitle": "네이버 블로그 제목",
  "naverContent": "네이버 블로그 본문 전체",
  "naverTags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6", "태그7", "태그8", "태그9", "태그10"],
  "daangnTitle": "당근마켓 제목(목록에 노출될 후킹 한 줄)",
  "daangn": "당근마켓 본문 (제목 제외)",
  "instagram": "인스타그램 본문 (해시태그 제외)",
  "instagramHashtags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "ctaQuestion": "우리 OO 청소 비용은 얼마일까요?"
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
  // 인스타 캡션은 해시태그 5개까지만 허용 — 모델이 초과 생성해도 앞 5개로 자름
  parsed.instagramHashtags = cleanTags(parsed.instagramHashtags).slice(0, 5)

  // 견적 유도 질문 — 모델이 비웠으면 제목 키워드로 주제 치환(집/매장/에어컨/세탁기…)
  parsed.ctaQuestion = (parsed.ctaQuestion ?? '').trim() || fallbackCtaQuestion(geoTitle)

  // 당근 제목 — 모델이 비웠으면 원본 글 제목으로 폴백(제목이 항상 맨 앞에 노출되도록)
  parsed.daangnTitle = (parsed.daangnTitle ?? '').trim() || geoTitle

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
