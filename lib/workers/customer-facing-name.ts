// 고객에게 내보내도 되는 담당자 이름인지 판정한다.
//
// 2026-08-22 사고: 도급팀을 직원 목록에 상호째로 등록해 뒀더니
// ("리멤버클린 김성현 팀장님") 후기 요청 알림톡의 #{담당자} 자리에 그대로 실려 나가,
// "다트클린에서 작업을 마쳤습니다 / 담당한 리멤버클린 …입니다" 라는 문장이 고객에게 갔다.
// 도급으로 돌린다는 사실은 업체의 영업 비밀이고, 한 번 나가면 되돌릴 수 없다.
//
// 이름 칸은 사장님이 자유롭게 적는 칸이라 앞으로도 상호·직함·메모가 섞여 들어온다.
// 그래서 '입력을 막는' 대신 '내보낼 때' 시스템이 걸러낸다 — 사장님이 규칙을 외울 필요가 없다.
//
// 판정 원칙: 사람 이름으로 보일 때만 통과. 조금이라도 애매하면 업체명으로 대체한다.
// (담당자 이름이 안 나가면 응답률이 조금 줄지만, 상호가 나가면 거래처를 잃는다.)

// 상호로 쓰이는 말 — 하나라도 들어 있으면 사람 이름이 아니라고 본다
const COMPANY_WORDS = [
  '클린', '청소', '케어', '서비스', '컴퍼니', '코리아', '시스템', '테크', '하우스',
  '홈케어', '산업', '기업', '상사', '그룹', '파트너', '주식회사', '유한회사', '(주)', '㈜',
  '사업자', '업체', '센터', '스토어', '마스터', '솔루션',
]

// 이름 자리에 들어오지만 사람을 가리키지 않는 말 — 그대로 내보내면 신뢰를 잃는다
const NOT_A_NAME = [
  '알바', '알바생', '직원', '기사님', '미배정', '테스트', '임시', '외주', '도급', '용역', '팀',
]

// 이름 뒤에 붙는 직함 — 이것만 남는 건 이름이 아니지만, 이름 뒤에 붙는 건 자연스럽다
const TITLES = ['팀장', '실장', '반장', '대리', '과장', '차장', '부장', '이사', '대표', '사장', '기사', '선생']

/** 사람 이름 하나로 보이는가 (예: 박기호, 김성현 팀장) */
export function looksLikePersonName(raw: string): boolean {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return false

  // 한글과 공백 외의 글자(영문·숫자·괄호·기호)가 있으면 사람 이름으로 보지 않는다.
  // 영문 이름을 쓰는 직원은 놓치지만, 상호·전화번호·메모가 새는 것보다 낫다.
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣ ]+$/.test(name)) return false
  if (name.length > 10) return false

  const bare = name.replace(/님$/, '')
  if (COMPANY_WORDS.some((w) => bare.includes(w))) return false

  const tokens = bare.split(' ').filter(Boolean)
  // 세 덩어리 이상이면 상호가 섞였다고 본다 (리멤버클린 / 김성현 / 팀장)
  if (tokens.length === 0 || tokens.length > 2) return false

  const [first, second] = tokens
  if (NOT_A_NAME.includes(first)) return false
  // 성명은 보통 2~4자. 한 자(성만)나 다섯 자 이상은 이름으로 보지 않는다
  if (first.length < 2 || first.length > 4) return false
  // 두 번째 덩어리는 직함일 때만 허용 — '김성현 리멤버클린' 같은 배치를 막는다
  if (second !== undefined && !TITLES.includes(second)) return false

  return true
}

/**
 * 고객에게 보낼 담당자 표기를 만든다.
 * 사람 이름이면 '김성현 팀장님', 아니면 '다트클린 담당자'.
 *
 * 알림톡은 빈 값을 거부하므로 어떤 경우에도 빈 문자열을 돌려주지 않는다.
 */
export function customerFacingWorkerName(
  rawName: string | null | undefined,
  businessName: string,
): string {
  const fallback = businessName.trim() ? `${businessName.trim()} 담당자` : '담당자'
  const name = (rawName ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return fallback
  if (!looksLikePersonName(name)) return fallback
  // '님'은 우리가 붙인다 — 사장님이 이미 붙여 적었으면 두 번 붙지 않게 정리
  return name.endsWith('님') ? name : `${name}님`
}

/**
 * 고객 문서(월간 보고서 등)에 담당자 이름을 나열할 때 쓴다.
 * 통과한 이름만 남기므로, 전부 걸러지면 빈 배열 — 그 줄은 아예 그리지 않는다.
 * 문서에는 '업체명 담당자'로 대체하지 않는다: 자기 업체 문서에 자기 이름을 다시 적는 꼴이라 정보가 없다.
 */
export function customerFacingWorkerNames(names: (string | null | undefined)[]): string[] {
  const out: string[] = []
  for (const raw of names) {
    const name = (raw ?? '').trim().replace(/\s+/g, ' ')
    if (!name || !looksLikePersonName(name)) continue
    const withHonorific = name.endsWith('님') ? name : `${name}님`
    if (!out.includes(withHonorific)) out.push(withHonorific)
  }
  return out
}
