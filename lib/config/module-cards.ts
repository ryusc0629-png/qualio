import { BASE_PRICE, MODULES, CLIENT_MIN } from '@/lib/config/modules'
import { formatMoney } from '@/lib/format/money'

// 요금제 페이지에 뿌리는 모듈 카드 문구.
//
// ★용어는 그대로 두고 **한 줄 부제**를 단다(2026-08-22 확정).
//   시방서·GEO 같은 말을 없애면 아는 사장님에겐 오히려 얕아 보이고,
//   법인 담당자도 그 말을 쓴다. 대신 아직 법인 거래를 안 해본 분을 위해
//   "왜 필요한지"를 한 줄로 붙인다.
// ⛔부제를 두 줄로 늘리지 말 것 — 문단이 쌓이면 읽기 전에 화면을 닫는다.
// ⛔금액을 여기에 다시 쓰지 말 것 — modules.ts가 단일 소스다.

export interface ModuleCard {
  name: string
  price: string
  per?: string
  who: string
  core?: boolean
  features: { t: string; d?: string }[]
}

export const MODULE_CARDS: ModuleCard[] = [
  {
    name: '기본',
    price: formatMoney(BASE_PRICE),
    who: '모든 업체 · 사장님 1명 포함',
    core: true,
    features: [
      { t: '예약 · 일정 · 배정' },
      { t: '고객 관리 · 상담 기록' },
      { t: '고객 견적 폼 · 3단계 견적', d: '손님이 직접 적으면 세 가지 안이 만들어져요' },
      { t: '매출 · 지출 장부' },
      { t: '알림톡', d: '예약 확정 · 전날 안내 · 영수증이 자동으로 나가요' },
      { t: '홈페이지 자동 생성' },
      { t: '후기 요청 · 재방문 유도', d: '끝나면 후기 부탁, 90일 뒤 다시 연락해요' },
    ],
  },
  {
    name: MODULES.field.label,
    price: formatMoney(MODULES.field.price),
    per: '/명',
    who: MODULES.field.who,
    features: [
      { t: '현장 직원 앱', d: '기사님 폰으로 오늘 갈 곳이 떠요' },
      { t: '작업 보고서 자동 정리 · 고객 발송', d: '사진만 올리면 손님께 보낼 문서가 돼요' },
      { t: 'GPS 근태 · 급여 · 명세서', d: '출퇴근이 위치로 찍혀 급여까지 이어져요' },
      { t: '문단속 사진 인증' },
      { t: '작업 항목 확인', d: '정해둔 항목마다 사진을 올려야 완료가 눌려요' },
      { t: '도급사 정산 · 표준 도급 계약서' },
    ],
  },
  {
    name: MODULES.marketing.label,
    price: formatMoney(MODULES.marketing.price),
    per: '/지역',
    who: MODULES.marketing.who + ' · 1개 지역 포함',
    features: [
      { t: '홈페이지 글 자동 발행 월 24편', d: '손 안 대도 우리 동네 검색어로 올라가요' },
      { t: '네이버 · 당근 · 인스타 원고 각 24편', d: '글 한 편이 세 채널 원고로 다시 만들어져 합계 96편' },
      { t: '홍보 영상 매달 5편', d: '현장 영상만 올리면 릴스가 만들어져요' },
      { t: 'AI 검색 노출 측정 주 1회', d: '챗GPT · 제미나이에 우리 업체가 나오는지 재요' },
      { t: '내 도메인으로 홈페이지 열기' },
    ],
  },
  {
    name: MODULES.client.label,
    price: '정기 매출의 1%',
    per: `최소 ${formatMoney(CLIENT_MIN)}`,
    who: MODULES.client.who,
    features: [
      { t: '거래처 견적서', d: '한 거래처에 여러 안을 보내고 링크로 열어보게 해요' },
      { t: '시방서 · 용역 계약서', d: '법인이 계약 전에 꼭 달라는 서류예요' },
      { t: '정기계약 관리 · 방문 자동 생성', d: '매달 갈 날짜가 저절로 잡혀요' },
      { t: '초도 리포트 · 월간 리포트', d: '재계약 때 “이만큼 했습니다”를 보여주는 문서예요' },
      { t: '미팅 녹음 정리', d: '녹음만 올리면 정리해 드려요' },
    ],
  },
]
