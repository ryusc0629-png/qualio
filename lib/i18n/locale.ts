// ────────────────────────────────────────────────────────────────────────────
// 마켓(국가) 설정 — 단일 소스(single source of truth)
//
// 왜 존재하는가:
//   통화('원')·날짜타임존('Asia/Seoul')·로케일('ko-KR')·전화번호 규칙이 코드 곳곳에
//   하드코딩되면, 일본 등 해외 진출 시 수백 곳을 일일이 고쳐야 한다(대공사 + 버그).
//   이 파일 하나가 "지금 어떤 나라로 동작하는가"를 정의하고,
//   lib/format/* 포매터들이 전부 이 값을 읽어 동작한다.
//
// 지금 단계의 목표:
//   한국만 서비스하므로 동작은 100% 한국이다. 다만 "한국 전용으로 굳어버리지 않게"
//   추상화 지점만 심어둔다. 일본 진출이 실제로 결정되면 JP 설정을 켜고,
//   콘텐츠(문구/약관/알림톡 템플릿)와 결제·소모품 모듈만 현지화하면 된다.
//
// 새 코드 작성 규칙:
//   - 금액 표시는 toLocaleString 직접 호출 금지 → lib/format/money.ts 의 formatMoney 사용
//   - 날짜/시간 표시는 timeZone 'Asia/Seoul' 직접 작성 금지 → lib/format/datetime.ts 사용
//   - 전화번호 포맷은 lib/format/phone.ts 사용
// ────────────────────────────────────────────────────────────────────────────

export type MarketCode = 'KR' | 'JP'

export interface MarketConfig {
  /** 국가 코드 */
  code: MarketCode
  /** BCP-47 로케일 (Intl 포맷에 사용) */
  locale: string
  /** IANA 타임존 (서버는 UTC로 동작하므로 표시용 타임존을 반드시 명시) */
  timeZone: string
  /** ISO 4217 통화 코드 */
  currency: string
  /** 화면에 붙는 통화 기호/표기 */
  currencySymbol: string
  /** 통화 기호 위치 — 한국 '39,000원'(suffix) / 일본 '¥39,000'(prefix) */
  currencyPosition: 'prefix' | 'suffix'
  /** 전화번호 포맷 규칙 분기 키 */
  phoneCountry: 'KR' | 'JP'
  /** 국제전화 국가번호 */
  phoneCallingCode: string
}

// 마켓별 설정 표. 새 국가는 여기에 한 줄 추가하면 된다.
const MARKETS: Record<MarketCode, MarketConfig> = {
  KR: {
    code: 'KR',
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    currency: 'KRW',
    currencySymbol: '원',
    currencyPosition: 'suffix',
    phoneCountry: 'KR',
    phoneCallingCode: '+82',
  },
  // 일본 진출 시 이 블록을 그대로 사용한다(미리 정의만 해 둠).
  JP: {
    code: 'JP',
    locale: 'ja-JP',
    timeZone: 'Asia/Tokyo',
    currency: 'JPY',
    currencySymbol: '¥',
    currencyPosition: 'prefix',
    phoneCountry: 'JP',
    phoneCallingCode: '+81',
  },
}

/** 기본 마켓 — 환경변수 미설정 시 한국 */
const DEFAULT_MARKET: MarketCode = 'KR'

function resolveMarketCode(): MarketCode {
  // NEXT_PUBLIC_ 접두사라 서버/클라이언트 양쪽에서 읽힌다.
  const raw = process.env.NEXT_PUBLIC_MARKET
  if (raw === 'JP') return 'JP'
  return DEFAULT_MARKET
}

/**
 * 현재 활성 마켓 설정을 반환한다.
 * 모든 포매터(money/datetime/phone)가 이 함수를 통해 동작한다.
 */
export function getMarket(): MarketConfig {
  return MARKETS[resolveMarketCode()]
}
