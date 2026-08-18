// AI 답변에서 '함께 추천된 업체 이름'을 뽑는다.
//
// 왜 필요한가: 지금 리더보드는 soomgo.com 같은 웹 도메인만 보여준다. 그런데 AI는
// 짧은 추천 질문에 지도 데이터로 답하기 때문에, 답변에 뜨는 건 웹사이트가 아니라
// 업체 이름(에코크린기업·청소플러스…)이다. 도메인만 세면 정작 우리와 경쟁하는
// 업체가 누군지 안 보이고, "우리가 몇 등인가"도 알 수 없다.
//
// 완벽한 추출은 불가능하다(자유 문장이라). 그래서 확실한 것만 건진다 —
// 목록·굵은 글씨처럼 '이름 자리'에 있으면서 청소업 상호로 보이는 것만.
// 애매하면 버린다. 잘못 넣은 이름 하나가 리더보드 전체의 신뢰를 깎기 때문이다.

/** 청소업 상호에 흔히 붙는 말 — 하나라도 있어야 후보로 본다 */
const BUSINESS_HINTS = [
  '클린', '크린', '청소', '케어', '위생', '환경', '하우스', '홈', '토탈',
  '종합관리', '주택관리', '용역', '방역', '세스코',
]

/** 업체명이 아닌 게 확실한 말 — 있으면 버린다.
 *
 * AI는 "업체 고를 때 확인할 것: 청소 범위와 주기, 환경 친화성…"처럼 체크리스트를
 * 굵은 글씨나 목록으로 낸다. 그걸 상호로 착각해 리더보드 2위에 "청소 범위"가
 * 올라간 적이 있다. 설명·항목으로 쓰이는 말은 넉넉히 걸러낸다. */
const STOPWORDS = [
  // 문장·서술
  '추천', '업체를', '업체는', '고려', '비용', '가격', '견적', '문의', '상담',
  '경우', '때문', '입니다', '있습니다', '합니다', '해야', '참고', '주의',
  '아래', '다음', '이상', '이하', '기준', '평균', '서비스를', '선택',
  // 체크리스트 항목으로 자주 나오는 말
  '범위', '주기', '방법', '항목', '종류', '조건', '절차', '과정', '단계',
  '친화', '만족', '후기가', '경력', '자격', '보험', '면허', '실적',
  '요금', '단가', '평당', '규모', '시간대', '인력', '장비', '약품',
  // 채널·플랫폼
  '네이버', '카카오', '구글', '블로그', '카페', '홈페이지', '숨고', '미소',
]

/** 상호 뒤에 붙어 나오는 군더더기 — 떼어낸다 */
const TRAILING = /(은|는|이|가|을|를|의|에|에서|와|과|도|이라는|라는|입니다|이며|이고)$/

function clean(raw: string): string {
  return raw
    // 주소가 이름에 붙어 들어오던 것 제거 — "미소크린https://…" 처럼 찍혔다
    .replace(/https?:\/\/\S*/gi, '')
    .replace(/https?/gi, '')
    .replace(/[\w.-]+\.(com|co\.kr|kr|net|org)\S*/gi, '')
    .replace(/^[\s*_·\-–—•]+/, '')
    .replace(/[\s*_]+$/, '')
    .replace(/^\d+[.)]\s*/, '')       // "1. " "2) "
    .replace(/^\(주\)|주식회사\s*/, '') // 법인 표기는 떼고 비교(표시는 원문 유지 어려워 통일)
    .replace(/[()[\]{}"'“”‘’,]/g, '')
    .replace(TRAILING, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeBusiness(name: string): boolean {
  if (name.length < 2 || name.length > 20) return false
  if (/^\d+$/.test(name)) return false
  if (STOPWORDS.some((w) => name.includes(w))) return false
  // 상호는 보통 띄어쓰기가 두 칸을 넘지 않는다
  if (name.split(' ').length > 3) return false
  // 여러 낱말을 잇는 말이 있으면 상호가 아니라 설명이다 — "청소 범위와 주기"
  if (/(와|과|및|이나|또는|그리고)\s/.test(name)) return false
  if (/(와|과)$/.test(name)) return false
  // '~성', '~도'로 끝나면 성질을 가리키는 말이다 — "환경 친화성", "만족도"
  if (/(성|도|율|력)$/.test(name) && name.length <= 6) return false
  return BUSINESS_HINTS.some((h) => name.includes(h))
}

/**
 * 답변 텍스트에서 업체 이름 후보를 뽑는다(등장 순서 유지, 중복 제거).
 * 확실한 자리(굵은 글씨·번호 목록·불릿)에 있는 것만 본다.
 */
export function extractBusinessNames(answer: string, limit = 8): string[] {
  if (!answer) return []

  const found: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const name = clean(raw)
    if (!looksLikeBusiness(name)) return
    const key = name.replace(/\s/g, '')
    if (seen.has(key)) return
    seen.add(key)
    found.push(name)
  }

  // 1) **굵은 글씨** — AI가 업체명을 강조할 때 가장 흔한 형태
  for (const m of answer.matchAll(/\*\*([^*\n]{2,30})\*\*/g)) push(m[1])

  // 2) 번호 목록·불릿의 첫 토막 — "1. 에코크린기업 - 반구동에 위치한…"
  for (const line of answer.split('\n')) {
    // 불릿 기호로 '*'도 받되 '**굵은 글씨**'의 첫 별표는 제외한다
    // (안 그러면 "**다트클린**은 울주군" 줄에서 "*다트클린**은 울주군"을 통째로 집는다)
    const m = line.match(/^\s*(?:\d+[.)]|[-•]|\*(?!\*))\s*([^\n:·—–-]{2,30})/)
    if (m) push(m[1])
  }

  return found.slice(0, limit)
}
