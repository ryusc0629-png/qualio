// 마케팅 채널 정의 — 홍보 링크(?ch=)와 대시보드 통계가 공유하는 단일 출처
// 사장님이 채널별 전용 링크를 복사해 배포 → 방문/퍼널에 어느 채널에서 왔는지 확정 기록

export interface MarketingChannel {
  key: string     // URL ?ch= 값 (영문 소문자)
  label: string   // 대시보드 표시명
  emoji: string   // 목록 아이콘
  hint: string    // 어디에 붙이는 링크인지 한 줄 설명
}

// 한국 청소업체가 실제로 쓰는 홍보 채널 (필요 시 여기만 추가하면 링크·통계에 자동 반영)
export const MARKETING_CHANNELS: MarketingChannel[] = [
  { key: 'naver_place', label: '네이버 플레이스', emoji: '🟢', hint: '플레이스 소개/설명란에 넣는 링크' },
  { key: 'naver_blog',  label: '네이버 블로그',   emoji: '📗', hint: '블로그 글 하단에 넣는 링크' },
  { key: 'instagram',   label: '인스타그램',      emoji: '📷', hint: '프로필/게시물의 링크' },
  { key: 'danggeun',    label: '당근',            emoji: '🥕', hint: '당근 게시글·프로필 링크' },
  { key: 'kakao',       label: '카카오톡',        emoji: '💬', hint: '채널/오픈채팅으로 보내는 링크' },
  { key: 'flyer',       label: '전단지·명함 QR',  emoji: '📄', hint: '인쇄물 QR코드로 만들 링크' },
]

// 유료 검색광고 채널 — 광고관리자(네이버/구글)에서 랜딩 URL에 ?ch= 로 심어 유입을 구분.
// 링크 복사 카드엔 안 나오지만(사장님이 손수 붙여넣는 게 아니라 광고관리자에서 세팅) 통계엔 별도로 잡힘.
// 다트클린 랜딩: qualio.co.kr/biz/dartclean?ch=naver_pl / ?ch=google_search
export const AD_CHANNELS: MarketingChannel[] = [
  { key: 'naver_pl',      label: '네이버 파워링크', emoji: '🔎', hint: '네이버 검색광고에서 온 방문' },
  { key: 'google_search', label: '구글 검색광고',   emoji: '🌐', hint: '구글 검색광고에서 온 방문' },
]

// 시스템이 자동으로 붙이는 내부 채널 — 링크 복사 카드엔 안 나오지만 통계엔 잡힘
// (자동 발행 블로그 글의 견적 버튼처럼, 사장님이 손수 배포하지 않아도 유입 출처를 구분)
export const AUTO_CHANNELS: MarketingChannel[] = [
  { key: 'post', label: '자동발행 글', emoji: '✍️', hint: '자동 발행되는 블로그 글의 견적 버튼에서 온 방문' },
]

// 알려진 모든 채널(홍보·광고·자동) — 통계 순회·라벨·검증의 단일 출처
export const ALL_CHANNELS: MarketingChannel[] = [...AD_CHANNELS, ...MARKETING_CHANNELS, ...AUTO_CHANNELS]

const CHANNEL_KEYS = new Set(ALL_CHANNELS.map((c) => c.key))

// 표시용 레이블 조회 (알 수 없는 값은 그대로 노출)
export function channelLabel(key: string | null | undefined): string {
  if (!key) return '직접·기타'
  return ALL_CHANNELS.find((c) => c.key === key)?.label ?? key
}

// 알려진 채널만 통과 — 임의 문자열 저장 방지(오염된 통계 예방)
export function normalizeChannel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toLowerCase().trim()
  return CHANNEL_KEYS.has(v) ? v : null
}
