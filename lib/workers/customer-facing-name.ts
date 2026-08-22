// 고객에게 내보낼 담당자 표기를 만든다.
//
// 2026-08-22 사고: 도급팀을 직원 목록에 상호째로 등록해 뒀더니
// ("리멤버클린 김성현 팀장님") 후기 요청 알림톡의 #{담당자} 자리에 그대로 실려 나가,
// "다트클린에서 작업을 마쳤습니다 / 담당한 리멤버클린 …입니다" 라는 문장이 고객에게 갔다.
// 도급으로 돌린다는 사실은 업체의 영업 비밀이고, 한 번 나가면 되돌릴 수 없다.
//
// 이름 칸은 하나뿐이고 사장님이 자유롭게 적는 칸이다(도급사는 정산 때문에 상호로 적는 게 맞다).
// 그래서 '입력을 막는' 대신 '내보낼 때' 상호를 떼어낸다 — 사장님이 규칙을 외울 필요가 없다.
//
// 규칙(사장님 결정 2026-08-22):
//   · 상호는 우리끼리 구분하는 값 → 고객에게 절대 안 나간다
//   · 사람 이름은 살린다 → 사람이 부탁해야 후기 응답률이 오른다
//   · 도급사는 전부 '팀장님' 급으로 나간다 → 고객에게는 우리 팀으로 보인다
//   · 사람 이름을 못 찾으면 업체명으로 대체한다 (추측해서 내보내지 않는다)

// 상호에 쓰이는 말 — 이름 후보에 하나라도 들어 있으면 사람 이름이 아니라고 본다
const COMPANY_WORDS = [
  '클린', '청소', '케어', '서비스', '컴퍼니', '코리아', '시스템', '테크', '하우스',
  '산업', '기업', '상사', '그룹', '파트너', '주식회사', '유한회사',
  '업체', '센터', '스토어', '마스터', '솔루션', '홈즈',
]

// 이름 자리에 들어오지만 사람을 가리키지 않는 말 — 그대로 내보내면 신뢰를 잃는다
const NOT_A_NAME = [
  '알바', '알바생', '직원', '미배정', '테스트', '임시', '외주', '도급', '용역', '본사', '사무실',
]

// 이름 뒤에 붙는 직함. 이름을 찾을 때는 떼어내고, 내보낼 때는 다시 붙인다
const TITLES = [
  '팀장', '실장', '반장', '소장', '대리', '과장', '차장', '부장',
  '이사', '대표', '사장', '기사', '선생', '매니저',
]

/** 도급사에 직함이 안 적혀 있을 때 붙이는 기본 직함 */
const CONTRACTOR_TITLE = '팀장'

/**
 * 이름 칸에서 사람 이름만 뽑아낸다. 못 뽑으면 null.
 *
 * 한국어 표기 관행상 상호가 앞, 사람이 뒤에 온다("리멤버클린 김성현 팀장").
 * 그래서 직함을 떼어낸 뒤 남은 마지막 덩어리를 사람 이름 후보로 보고,
 * 그 후보가 사람 이름 조건을 통과할 때만 인정한다. 애매하면 null — 안 내보내는 쪽이 안전하다.
 */
export function extractPersonName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return null

  const bare = name.replace(/님$/, '')
  const tokens = bare.split(' ').filter(Boolean)
  if (tokens.length === 0 || tokens.length > 4) return null

  const withoutTitle = tokens.filter((t) => !TITLES.includes(t))
  const candidate = withoutTitle[withoutTitle.length - 1]
  if (!candidate) return null

  // 한글만. 영문·숫자가 섞이면(상호, 전화번호, 메모) 사람 이름으로 보지 않는다
  if (!/^[가-힣]+$/.test(candidate)) return null
  // 성명은 보통 2~4자
  if (candidate.length < 2 || candidate.length > 4) return null
  if (COMPANY_WORDS.some((w) => candidate.includes(w))) return null
  if (NOT_A_NAME.includes(candidate)) return null

  return candidate
}

/** 이름 칸에 적혀 있는 직함 (없으면 null) */
function writtenTitle(raw: string | null | undefined): string | null {
  const tokens = (raw ?? '').trim().replace(/님$/, '').split(/\s+/).filter(Boolean)
  return TITLES.find((t) => tokens.includes(t)) ?? null
}

/**
 * 고객에게 보낼 담당자 표기를 만든다.
 *
 * - 리멤버클린 김성현 팀장님 (도급사) → 김성현 팀장님
 * - 리멤버클린 김성현      (도급사) → 김성현 팀장님   ← 도급사는 직함을 팀장으로 채운다
 * - 박기호               (직원)   → 박기호님
 * - 베이스케어            (도급사) → 다트클린 담당자   ← 사람 이름이 없으면 업체명으로
 *
 * 알림톡은 빈 값을 거부하므로 어떤 경우에도 빈 문자열을 돌려주지 않는다.
 */
export function customerFacingWorkerName(
  rawName: string | null | undefined,
  businessName: string,
  opts: { isContractor?: boolean } = {},
): string {
  const fallback = businessName.trim() ? `${businessName.trim()} 담당자` : '담당자'

  const person = extractPersonName(rawName)
  if (!person) return fallback

  // 적어둔 직함이 있으면 존중하고, 도급사인데 없으면 팀장으로 채운다
  const title = writtenTitle(rawName) ?? (opts.isContractor ? CONTRACTOR_TITLE : null)
  return title ? `${person} ${title}님` : `${person}님`
}
