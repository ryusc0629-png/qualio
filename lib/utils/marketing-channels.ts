// 마케팅 채널 정의 — 홍보 링크(?ch=)와 대시보드 통계가 공유하는 단일 출처
// 사장님이 채널별 전용 링크를 복사해 배포 → 방문/퍼널에 어느 채널에서 왔는지 확정 기록

export interface MarketingChannel {
  key: string     // URL ?ch= 값 (영문 소문자)
  label: string   // 대시보드 표시명
  emoji: string   // 목록 아이콘
  hint: string    // 어디에 붙이는 링크인지 한 줄 설명
  // 링크를 붙여 넣으러 갈 곳 — 사장님이 '어디 가서 넣지?'로 막히지 않게 바로 열어준다
  manageUrl?: string
  // 인쇄물용 — 링크가 아니라 QR 그림이 필요한 채널(복사해봐야 종이에 못 붙인다)
  needsQr?: boolean
}

// 한국 청소업체가 실제로 쓰는 홍보 채널 (필요 시 여기만 추가하면 링크·통계에 자동 반영)
export const MARKETING_CHANNELS: MarketingChannel[] = [
  { key: 'naver_place', label: '네이버 플레이스', emoji: '🟢', hint: '플레이스 소개/설명란에 넣는 링크', manageUrl: 'https://new.smartplace.naver.com/' },
  { key: 'naver_blog',  label: '네이버 블로그',   emoji: '📗', hint: '블로그 글 하단에 넣는 링크', manageUrl: 'https://blog.naver.com/' },
  { key: 'instagram',   label: '인스타그램',      emoji: '📷', hint: '프로필/게시물의 링크', manageUrl: 'https://www.instagram.com/' },
  // 숏폼 3형제 — 릴스 한 편을 인스타·틱톡·쇼츠·네이버 클립에 돌려 올리므로 채널을 갈라 잡는다.
  // ⚠️틱톡·인스타는 캡션에 쓴 링크가 눌리지 않는다 → 프로필(link in bio)에 넣어야 유입이 잡힌다.
  { key: 'tiktok',      label: '틱톡',            emoji: '🎵', hint: '프로필 링크(캡션 링크는 안 눌려요)', manageUrl: 'https://www.tiktok.com/' },
  { key: 'youtube',     label: '유튜브',          emoji: '▶️', hint: '영상 설명란·채널 정보에 넣는 링크', manageUrl: 'https://studio.youtube.com/' },
  // 네이버 클립은 발행할 때 '링크'를 태그로 걸 수 있다 — 숏폼 중 유일하게 영상에서 바로 눌린다
  { key: 'naver_clip',  label: '네이버 클립',      emoji: '🎬', hint: '클립 발행할 때 링크로 태그하는 주소', manageUrl: 'https://m.blog.naver.com/' },
  { key: 'danggeun',    label: '당근',            emoji: '🥕', hint: '당근 게시글·프로필 링크', manageUrl: 'https://www.daangn.com/kr/business/' },
  { key: 'kakao',       label: '카카오톡',        emoji: '💬', hint: '채널/오픈채팅으로 보내는 링크', manageUrl: 'https://center-pf.kakao.com/' },
  { key: 'flyer',       label: '전단지·명함 QR',  emoji: '📄', hint: '인쇄물에 넣는 QR — 손님이 찍으면 견적 폼이 열려요', needsQr: true },
  { key: 'proposal',    label: '제안서 QR',       emoji: '📑', hint: '병원·업체 방문영업 제안서에 넣는 QR', needsQr: true },
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

// 오프라인·수기 유입 — 링크(?ch=)로 안 들어와 사장님이 손으로 고르는 유입원.
// 전화·소개처럼 QR/링크로 못 잡는 손님을 예약 등록 때 '어떻게 알고 오셨어요?'로 채널에 편입한다.
export const OFFLINE_CHANNELS: MarketingChannel[] = [
  { key: 'referral', label: '소개·지인', emoji: '🤝', hint: '기존 고객·지인 소개로 온 손님' },
  { key: 'phone',    label: '전화 문의', emoji: '📞', hint: '광고·간판을 보고 바로 전화한 손님' },
]

// 알려진 모든 채널(홍보·광고·자동·오프라인) — 통계 순회·라벨·검증의 단일 출처
export const ALL_CHANNELS: MarketingChannel[] = [...AD_CHANNELS, ...MARKETING_CHANNELS, ...AUTO_CHANNELS, ...OFFLINE_CHANNELS]

// 수기 등록('어떻게 알고 오셨어요?') 드롭다운 선택지 — 사장님이 고를 만한 유입원만, 쉬운 순서로.
// 광고(naver_pl/google_search)·자동발행(post)은 시스템이 자동으로 붙이므로 제외.
export const MANUAL_SOURCE_OPTIONS: MarketingChannel[] = [...OFFLINE_CHANNELS, ...MARKETING_CHANNELS]

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
