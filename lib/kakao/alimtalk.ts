import { SolapiMessageService } from 'solapi'

// 예약 확정 알림톡 발송 파라미터
// 퀄리오 단일 채널로 모든 고객사 대신 발송 — 업체별 Solapi 가입 불필요
export interface BookingConfirmParams {
  customerPhone: string
  businessName: string
  businessPhone: string | null
  cleaningType: string
  scheduledAt: string   // ISO 문자열 → 한국어 날짜로 변환
  serviceAddress: string
  selectedTier: 'good' | 'better' | 'best'
  finalPrice: number
}

// 티어 한국어 라벨 매핑
const TIER_LABELS: Record<string, string> = {
  good:   '기본',
  better: '추천',
  best:   '프리미엄',
}

// ISO 날짜를 한국어 형식으로 변환
function formatKoreanDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

// 견적 발송 알림톡 파라미터
export interface QuoteSentParams {
  customerPhone: string
  customerName: string
  businessName: string
  businessPhone: string | null
  cleaningType: string
  spaceSize?: number
  preferredDate?: string
  goodPrice: number
  betterPrice: number
  bestPrice: number
  quoteUrl: string
}

// 견적 발송 알림톡 — 가격 확인 직후 고객에게 발송
export async function sendQuoteAlimtalk(params: QuoteSentParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_QUOTE_SENT
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] QUOTE_SENT 템플릿 미설정 — 발송 생략')
    return
  }

  const service = new SolapiMessageService(apiKey, apiSecret)

  const preferredDateKr = params.preferredDate
    ? new Date(params.preferredDate + 'T00:00:00').toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : '미정'

  await service.sendOne({
    to:   params.customerPhone,
    from: sender,
    type: 'ATA',
    kakaoOptions: {
      pfId,
      templateId,
      variables: {
        '#{고객명}':     params.customerName,
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{평수}':       params.spaceSize ? ` ${params.spaceSize}평` : '',
        '#{희망날짜}':   preferredDateKr,
        '#{기본가}':     params.goodPrice.toLocaleString('ko-KR'),
        '#{추천가}':     params.betterPrice.toLocaleString('ko-KR'),
        '#{프리미엄가}': params.bestPrice.toLocaleString('ko-KR'),
        '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
        '#{예약링크}':   params.quoteUrl,
      },
    },
  })
}

// 일정 변경 알림톡 파라미터
export interface RescheduleParams {
  customerPhone: string
  businessName:  string
  businessPhone: string | null
  cleaningType:  string
  oldScheduledAt: string  // ISO 문자열
  newScheduledAt: string  // ISO 문자열
}

// 일정 변경 알림톡 발송
export async function sendRescheduleAlimtalk(params: RescheduleParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_RESCHEDULE
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] RESCHEDULE 템플릿 미설정 — 발송 생략')
    return
  }

  const service = new SolapiMessageService(apiKey, apiSecret)

  await service.sendOne({
    to:   params.customerPhone,
    from: sender,
    type: 'ATA',
    kakaoOptions: {
      pfId,
      templateId,
      variables: {
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{변경전일시}': formatKoreanDate(params.oldScheduledAt),
        '#{변경후일시}': formatKoreanDate(params.newScheduledAt),
        '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
      },
    },
  })
}

// 예약 확정 알림톡 발송 (퀄리오 채널로 고객사 대신 발송)
export async function sendBookingConfirmAlimtalk(params: BookingConfirmParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_BOOKING_CONFIRM
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID   // 퀄리오 단일 채널 ID

  // 환경변수 미설정 시 발송 생략 (개발 환경 안전)
  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] 환경변수 미설정 — 발송 생략')
    return
  }

  const service = new SolapiMessageService(apiKey, apiSecret)

  const scheduledDateKr = formatKoreanDate(params.scheduledAt)
  const tierLabel       = TIER_LABELS[params.selectedTier] ?? params.selectedTier
  const priceFormatted  = params.finalPrice.toLocaleString('ko-KR')
  const contactInfo     = params.businessPhone ?? '업체에 문의해 주세요'

  await service.sendOne({
    to:   params.customerPhone,
    from: sender,
    type: 'ATA',
    kakaoOptions: {
      pfId,
      templateId,
      variables: {
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{예약일시}':   scheduledDateKr,
        '#{서비스주소}': params.serviceAddress,
        '#{선택플랜}':   tierLabel,
        '#{최종금액}':   priceFormatted,
        '#{업체연락처}': contactInfo,
      },
    },
  })
}
