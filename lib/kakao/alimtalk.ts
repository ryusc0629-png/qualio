import { SolapiMessageService } from 'solapi'
import { formatDateTime } from '@/lib/format/datetime'

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
  // V2 버튼 템플릿용 (선택) — 전화 연결·일정 변경 버튼
  bookingId?: string
  businessId?: string
}

// 티어 한국어 라벨 매핑
const TIER_LABELS: Record<string, string> = {
  good:   '기본',
  better: '추천',
  best:   '프리미엄',
}

// ISO 날짜를 현지 표시 형식으로 변환(통화/타임존은 마켓 설정을 따른다)
function formatKoreanDate(isoString: string): string {
  return formatDateTime(isoString)
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

// 예약 리마인더 알림톡 파라미터 (방문 전날 저녁 발송)
export interface ReminderParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  businessPhone: string | null
  cleaningType:  string
  scheduledAt:   string  // ISO 문자열
  serviceAddress: string
}

// 예약 리마인더 알림톡 발송 (방문 전날 18시 KST 자동 발송)
export async function sendReminderAlimtalk(params: ReminderParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_REMINDER
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] REMINDER 템플릿 미설정 — 발송 생략')
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
        '#{고객명}':     params.customerName,
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{예약일시}':   formatKoreanDate(params.scheduledAt),
        '#{서비스주소}': params.serviceAddress,
        '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
      },
    },
  })
}

// 리뷰 요청 알림톡 파라미터
export interface ReviewRequestParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  cleaningType:  string
  reviewUrl:     string  // 네이버 플레이스 리뷰 링크
}

// 리뷰 요청 알림톡 발송 (작업 완료 후 고객에게 발송)
export async function sendReviewRequestAlimtalk(params: ReviewRequestParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_REVIEW_REQUEST
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] REVIEW_REQUEST 템플릿 미설정 — 발송 생략')
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
        '#{고객명}':   params.customerName,
        '#{업체명}':   params.businessName,
        '#{서비스명}': params.cleaningType,
        '#{리뷰링크}': params.reviewUrl,
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '리뷰 남기기',
          linkMo: params.reviewUrl,
          linkPc: params.reviewUrl,
        },
      ],
    },
  })
}

// 작업 완료 보고서 알림톡 파라미터
export interface WorkCompleteParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  businessPhone: string | null
  cleaningType:  string
  scheduledAt:   string  // ISO 문자열
  reportUrl:     string  // 고객용 공개 보고서 링크
}

// 작업 완료 보고서 알림톡 발송
export async function sendWorkCompleteAlimtalk(params: WorkCompleteParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_WORK_COMPLETE
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] WORK_COMPLETE 템플릿 미설정 — 발송 생략')
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
        '#{고객명}':     params.customerName,
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{작업일시}':   formatKoreanDate(params.scheduledAt),
        '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
        '#{보고서링크}': params.reportUrl,
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '작업 보고서 확인',
          linkMo: params.reportUrl,
          linkPc: params.reportUrl,
        },
      ],
    },
  })
}

// 영수증 알림톡 파라미터 (결제 완료 후 사장님이 직접 발송)
export interface ReceiptParams {
  customerPhone:  string
  customerName:   string
  businessName:   string
  businessPhone:  string | null
  cleaningType:   string
  completedAt:    string  // 작업 완료일 ISO 문자열
  paidAmount:     number  // 실제 결제 금액
  receiptUrl:     string  // 고객용 영수증 링크
}

// 영수증 알림톡 발송 — 작업 완료 후 사장님이 "영수증 발송" 버튼으로 수동 트리거
export async function sendReceiptAlimtalk(params: ReceiptParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_RECEIPT
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] RECEIPT 템플릿 미설정 — 발송 생략')
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
        '#{고객명}':     params.customerName,
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{작업일시}':   formatKoreanDate(params.completedAt),
        '#{결제금액}':   params.paidAmount.toLocaleString('ko-KR'),
        '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
        '#{영수증링크}': params.receiptUrl,
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '영수증 확인하기',
          linkMo: params.receiptUrl,
          linkPc: params.receiptUrl,
        },
      ],
    },
  })
}

// 기사 출발 알림 파라미터 ("기사가 곧 도착해요" — 방문 직전 발송)
export interface OnMyWayParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  businessPhone: string | null
  cleaningType:  string
  scheduledAt:   string  // ISO 문자열
}

// 기사 출발 알림톡 발송. 실제 발송되면 true, 템플릿 미설정(심사 전 등)이면 false 반환.
// 호출부가 "보냈어요"를 거짓으로 표시하지 않도록 발송 여부를 알려준다.
export async function sendOnMyWayAlimtalk(params: OnMyWayParams): Promise<boolean> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_ON_MY_WAY
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] ON_MY_WAY 템플릿 미설정 — 발송 생략')
    return false
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
        '#{고객명}':     params.customerName,
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{예약일시}':   formatKoreanDate(params.scheduledAt),
        '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
      },
    },
  })
  return true
}

// 예약 확정 알림톡 발송 (퀄리오 채널로 고객사 대신 발송)
export async function sendBookingConfirmAlimtalk(params: BookingConfirmParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_BOOKING_CONFIRM
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID   // 퀄리오 단일 채널 ID

  // V2 템플릿이 있으면 V1 없이도 발송 가능
  const templateIdV2    = process.env.SOLAPI_TEMPLATE_ID_BOOKING_CONFIRM_V2
  const useV2           = !!(templateIdV2 && params.bookingId && params.businessId)
  const activeTemplateId = useV2 ? templateIdV2! : templateId

  if (!apiKey || !apiSecret || !sender || !activeTemplateId || !pfId) {
    console.warn('[Alimtalk] 환경변수 미설정 — 발송 생략')
    return
  }

  const service = new SolapiMessageService(apiKey, apiSecret)

  const scheduledDateKr = formatKoreanDate(params.scheduledAt)
  const tierLabel       = TIER_LABELS[params.selectedTier] ?? params.selectedTier
  const priceFormatted  = params.finalPrice.toLocaleString('ko-KR')
  const contactInfo     = params.businessPhone ?? '업체에 문의해 주세요'

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const rescheduleUrl = useV2
    ? `${appBaseUrl}/q/${params.businessId}/reschedule/${params.bookingId}`
    : undefined

  await service.sendOne({
    to:   params.customerPhone,
    from: sender,
    type: 'ATA',
    kakaoOptions: {
      pfId,
      templateId: activeTemplateId,
      variables: {
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{예약일시}':   scheduledDateKr,
        '#{서비스주소}': params.serviceAddress,
        '#{선택플랜}':   tierLabel,
        '#{최종금액}':   priceFormatted,
        '#{업체연락처}': contactInfo,
      },
      // V2 버튼: 일정 변경 요청 (전화 연결은 카카오가 tel: 웹링크를 막아 제외 — 전화번호는 본문 '문의:'로 안내)
      ...(useV2 && rescheduleUrl !== undefined ? {
        buttons: [
          {
            buttonType: 'WL' as const,
            buttonName: '일정 변경 요청',
            linkMo: rescheduleUrl!,
            linkPc: rescheduleUrl!,
          },
        ],
      } : {}),
    },
  })
}

// 후기 인증 알림 파라미터 (사장님에게 발송)
export interface ReviewClaimedParams {
  ownerPhone:          string  // 사장님 전화번호
  customerName:        string
  businessName:        string
  rewardDescription:   string | null
  dashboardUrl:        string
}

// 고객이 후기 인증 시 사장님에게 알림톡 발송
interface ReengagementParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  quoteUrl:      string   // 견적 신청 페이지 URL
}

export async function sendReengagementAlimtalk(params: ReengagementParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_REENGAGEMENT
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] REENGAGEMENT 템플릿 미설정 — 발송 생략')
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
        '#{업체명}': params.businessName,
        '#{고객명}': params.customerName,
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '견적 신청하기',
          linkMo: params.quoteUrl,
          linkPc: params.quoteUrl,
        },
      ],
    },
  })
}

interface QuoteFollowupParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  cleaningType:  string
  quoteUrl:      string   // 견적 페이지 URL
  isSecond:      boolean  // D+3 팔로업 여부
}

export async function sendQuoteFollowupAlimtalk(params: QuoteFollowupParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = params.isSecond
    ? process.env.SOLAPI_TEMPLATE_ID_QUOTE_FOLLOWUP2
    : process.env.SOLAPI_TEMPLATE_ID_QUOTE_FOLLOWUP
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] QUOTE_FOLLOWUP 템플릿 미설정 — 발송 생략')
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
        '#{업체명}':    params.businessName,
        '#{고객명}':    params.customerName,
        '#{서비스명}':  params.cleaningType,
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '견적 확인하고 예약하기',
          linkMo: params.quoteUrl,
          linkPc: params.quoteUrl,
        },
      ],
    },
  })
}

export async function sendReviewClaimedAlimtalk(params: ReviewClaimedParams): Promise<void> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_REVIEW_CLAIMED
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] REVIEW_CLAIMED 템플릿 미설정 — 발송 생략')
    return
  }

  const service = new SolapiMessageService(apiKey, apiSecret)

  await service.sendOne({
    to:   params.ownerPhone,
    from: sender,
    type: 'ATA',
    kakaoOptions: {
      pfId,
      templateId,
      variables: {
        '#{업체명}':   params.businessName,
        '#{고객명}':   params.customerName,
        '#{보상내용}': params.rewardDescription ?? '없음',
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '대시보드 확인',
          linkMo: params.dashboardUrl,
          linkPc: params.dashboardUrl,
        },
      ],
    },
  })
}
