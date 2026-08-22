import { SolapiMessageService } from 'solapi'
import { formatDateTime } from '@/lib/format/datetime'
import { customerFacingWorkerName } from '@/lib/workers/customer-facing-name'

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
  // '일정 변경 요청' 버튼 링크를 만드는 데 쓴다.
  // ⚠️ 선택값이 아니라 필수다 — 예전엔 optional이라 한쪽 호출부가 빼먹어도 조용히
  //    버튼 없는 V1으로 나갔고, 대표가 확정한 예약은 전부 그렇게 발송됐다(2026-08-16).
  //    타입으로 막아야 같은 실수가 반복되지 않는다.
  bookingId: string
  businessId: string
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
  // ⚠️ 아래 4개는 승인된 '견적 발송 v2' 템플릿이 쓰지 않는다(금액·희망일은 견적 페이지에서 보여준다).
  //    호출부 호환을 위해 필드는 남겨두되, 템플릿에 없는 변수는 보내지 않는다.
  preferredDate?: string
  goodPrice: number
  betterPrice: number
  bestPrice: number
  quoteUrl: string
}

// 견적 발송 알림톡 — 가격 확인 직후 고객에게 발송.
// 반환값: 실제 카카오 알림톡을 발송했으면 true, 템플릿 미설정·발송 실패면 false.
// (false면 호출부에서 아무것도 보내지 않는다 — 문자(SMS) 폴백은 발신번호 노출 때문에 제거됨)
export async function sendQuoteAlimtalk(params: QuoteSentParams): Promise<boolean> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_QUOTE_SENT
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] QUOTE_SENT 템플릿 미설정 — 알림톡 생략(문자 폴백 없음, 미발송)')
    return false
  }

  const service = new SolapiMessageService(apiKey, apiSecret)

  try {
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
          // 평수를 안 받은 견적은 공백 한 칸으로 채운다 — 빈 문자열은 변수 미치환으로 발송이 거부된다
          '#{평수}':       params.spaceSize ? `${params.spaceSize}평` : ' ',
          '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
          // ⚠️ 이 템플릿(견적 발송 v2)은 버튼이 없고 링크를 본문에 그대로 노출한다.
          //    따라서 다른 템플릿과 달리 qPathVar로 자르지 말고 전체 주소를 보내야 한다.
          //    버튼도 붙이면 안 된다(템플릿에 없는 버튼을 실으면 발송이 거부된다).
          '#{예약링크}':   params.quoteUrl,
        },
      },
    })
    return true
  } catch (e) {
    console.error('[Alimtalk] 견적 알림톡 발송 실패(문자 폴백 없음, 미발송):', e)
    return false
  }
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

// 후기 인증 페이지 주소 — 알림톡 템플릿의 버튼 링크(https://qualio.co.kr/review/#{리뷰토큰})와 반드시 일치해야 한다
const REVIEW_LINK_BASE = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'}/review`


// 템플릿에 등록된 버튼 링크가 `https://qualio.co.kr/q/#{링크}` 형태라,
// 코드는 도메인과 /q/ 를 뺀 나머지 경로만 `#{링크}` 변수로 보내야 한다.
// 완성된 전체 주소를 linkMo로 실어도 소용없다 — 템플릿에 박힌 링크가 우선한다.
// (2026-08-17: 예약확정 버튼이 /q/reschedule 로 가서 404 났던 것과 같은 원인)
function qPathVar(fullUrl: string): string {
  const i = fullUrl.indexOf('/q/')
  return i >= 0 ? fullUrl.slice(i + 3) : fullUrl
}

// 리뷰 요청 알림톡 파라미터
export interface ReviewRequestParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  cleaningType:  string
  reviewToken:   string           // 후기 인증 토큰. 링크는 템플릿이 https://qualio.co.kr/review/#{리뷰토큰} 형태로 갖고 있다
  // 현장 담당자 이름 — 회사가 아니라 사람이 부탁해야 응답률이 오른다.
  // 상호는 떼고 사람 이름만 나간다(도급사 상호 유출 방지) — customerFacingWorkerName 참고
  workerName?:   string | null
  // 'contractor'면 도급사 — 직함이 안 적혀 있어도 '팀장님'으로 나간다(사장님 결정 2026-08-22)
  workerType?:   string | null
  rewardText?:   string | null    // 감사 선물 안내 한 줄. 없으면 그 줄이 비어서 나간다
}

// 후기 요청 알림톡 발송 (작업 완료 후 고객에게 발송)
//
// 2026-08-16 심사 진행 중. 작업 완료라는 '수신자의 액션'에 이어지는 메시지라
// 팔로업·재방문 유도와 달리 정보성으로 인정될 여지가 있다.
// ⚠️ 다만 #{혜택}에 할인 문구가 들어가면 광고성으로 반려될 수 있다.
//    반려되면 혜택 줄을 빼고 재제출할 것 — 혜택은 인증 페이지에서만 보여주면 된다.
//    이 함수는 혜택이 비어도 정상 동작한다(공백 한 칸으로 채움).
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
        // 알림톡 버튼 링크는 프로토콜(https://)과 도메인을 템플릿에 고정으로 박아야 한다.
        // 전체 주소를 변수로 넣으면 https://https://... 가 되고, 도메인을 변수로 두면 심사에서 반려된다.
        '#{리뷰토큰}': params.reviewToken,
        // 담당자 표기는 여기서 한 번 더 거른다 — 발송 지점이 세 곳(수동·현장 마감·크론)이라
        // 호출부에서 거르면 언젠가 한 곳이 빠진다. 마지막 관문에서 막는다.
        // (2026-08-22: 도급팀 상호 '리멤버클린 …'이 이 자리로 나갔다)
        '#{담당자}':   customerFacingWorkerName(params.workerName, params.businessName, {
          isContractor: params.workerType === 'contractor',
        }),
        // 선물이 없으면 공백 한 칸 — 빈 문자열은 변수 미치환으로 반려될 수 있다
        '#{혜택}':     params.rewardText?.trim() || ' ',
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '후기 남기기',
          linkMo: `${REVIEW_LINK_BASE}/${params.reviewToken}`,
          linkPc: `${REVIEW_LINK_BASE}/${params.reviewToken}`,
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
        '#{링크}':       qPathVar(params.reportUrl),
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

// 결제 요청 알림톡 파라미터 (작업은 끝났고 아직 돈은 못 받은 시점)
export interface PaymentRequestParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  businessPhone: string | null
  cleaningType:  string
  workedAt:      string  // 작업일 ISO 문자열
  amount:        number  // 청구 금액
}

// 결제 요청 알림톡 발송 — 현장 기사가 "결제 요청하기"를 누를 때
//
// ⚠️ 예전엔 이 자리에서 '영수증' 템플릿을 그대로 썼다. 그래서 돈을 받기도 전에
//    고객에게 "결제가 완료되었습니다"가 나갔고, 함께 실린 영수증 링크는
//    예약이 아직 in_progress라 404였다(영수증 페이지는 completed만 연다).
//    청구와 증빙은 다른 문서다 — 템플릿을 갈라 두고 절대 섞지 말 것.
// 보냈으면 true. 템플릿이 아직 준비되지 않았으면 false —
// 호출한 쪽이 "보냈다"고 잘못 알리지 않도록 성공/미발송을 구분해서 돌려준다.
export async function sendPaymentRequestAlimtalk(params: PaymentRequestParams): Promise<boolean> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_PAYMENT_REQUEST
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] PAYMENT_REQUEST 템플릿 미설정 — 발송 생략')
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
      // 버튼 없는 템플릿이다 — 고객이 온라인으로 결제할 경로가 아직 없어서
      // 링크를 붙이면 또 죽은 버튼이 된다. 금액만 정확히 알리고 수금은 현장에서 한다.
      variables: {
        '#{고객명}':     params.customerName,
        '#{업체명}':     params.businessName,
        '#{서비스명}':   params.cleaningType,
        '#{작업일시}':   formatKoreanDate(params.workedAt),
        '#{결제금액}':   params.amount.toLocaleString('ko-KR'),
        '#{업체연락처}': params.businessPhone ?? '업체에 문의해 주세요',
      },
    },
  })

  return true
}

// 영수증 알림톡 파라미터 (수금이 기록된 뒤 자동 발송)
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

// 영수증 알림톡 발송 — 고객이 요청했을 때 사장님이 예약 상세에서 직접 보낸다.
// ⛔자동 발송으로 되돌리지 말 것: 바로 앞 '결제 요청' 카톡과 내용이 거의 같아 중복이고,
//   일회성 고객은 이미 작업 당일에만 카톡을 4~5통 받는다(2026-08-22 결정).
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
        '#{링크}':       qPathVar(params.receiptUrl),
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
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID   // 퀄리오 단일 채널 ID

  // V2('일정 변경 요청' 버튼 포함)를 기본으로 쓰고, 없을 때만 옛 V1으로 내려간다.
  // bookingId·businessId가 필수가 됐으므로 조건 분기로 V1에 잘못 빠질 일은 없다.
  const templateIdV2     = process.env.SOLAPI_TEMPLATE_ID_BOOKING_CONFIRM_V2
  const templateId       = process.env.SOLAPI_TEMPLATE_ID_BOOKING_CONFIRM
  const useV2            = !!templateIdV2
  // ⚠️ ?? 가 아니라 || 여야 한다. 환경변수를 빈 문자열('')로 두면 ?? 는 그걸 '값 있음'으로
  //    보고 templateId=''로 발송을 시도 → 아래 가드에 걸려 예약 확정 알림톡이 통째로
  //    '조용히 생략'된다(V1으로 내려가지도 않음). useV2는 이미 truthy 판정이라 기준도 어긋났다.
  const activeTemplateId = templateIdV2 || templateId

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
        // V2 템플릿의 버튼 링크가 https://qualio.co.kr/q/#{업체ID}/reschedule/#{예약ID} 형태다.
        // 이 두 변수를 안 보내면 빈 값으로 치환돼 /q//reschedule/ → /q/reschedule 로 404가 난다.
        // (2026-08-17 실제 발생 — linkMo에 전체 주소를 실어도 템플릿에 박힌 링크가 우선한다)
        '#{업체ID}':     params.businessId,
        '#{예약ID}':     params.bookingId,
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

// ⛔ 2026-08-16 카카오 반려 — 알림톡으로는 영구히 못 보낸다.
//    사유: "수신자가 요청하지 않은 내용 및 리마인드는 광고성·공지성에 해당"
//    알림톡은 수신자의 액션(예약·결제·작업완료)을 기반한 정보성 메시지만 허용된다.
//    재방문 유도는 성격 자체가 광고라 문안을 고쳐도 통과하지 않는다.
//    대안: 광고 문자(LMS, '(광고)' 표기 + 무료수신거부번호 필수) 또는
//         사장님이 직접 연락 — 우리는 '오늘 연락할 사람' 목록과 문구만 제공한다.
//    ⚠️ 이 템플릿으로 다시 심사 넣지 말 것.
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

// ⛔ 2026-08-16 카카오 반려 — 1차·2차(D+3) 모두 반려됐다.
//    사유: "수신자가 요청하지 않은 내용 및 리마인드는 광고성·공지성에 해당"
//    견적을 보낸 뒤 답이 없다고 다시 찔러보는 건 고객이 요청한 적 없는 리마인드다.
//    대안: 사장님이 직접 연락 — 우리는 대상 목록과 문구만 만들어 준다.
//    ⚠️ 이 템플릿으로 다시 심사 넣지 말 것.
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

// ── 작업 후 점검 시기 안내 ──────────────────────────────────────────
//
// 2026-08-16에 반려된 '재방문 유도'와는 사실관계가 다르다. 그 템플릿은 근거 없이
// "오래 안 오셨네요"를 보내는 순수 광고였다. 이건 셋이 다르다:
//   1) 수신자가 작업을 의뢰한 사실이 있고
//   2) 그 작업 보고서에 "○년 ○월쯤 점검을 권해드립니다. 그때 저희가 먼저 연락드리겠습니다"라고
//      이미 고지한 뒤이며(고객이 그 문서를 받았다)
//   3) 문안에 가격·할인·예약 유도가 하나도 없다. 버튼도 판촉이 아니라 그 보고서를 여는 링크다.
//
// ⚠️ 이 템플릿에 "지금 예약하시면", "할인", "문의 주세요" 같은 문구를 절대 넣지 말 것.
//    한 문장만 들어가도 광고성이 되어 반려되고, 반려되면 문자(LMS)로 되돌아간다(건당 요금 발생).
//
// 승인 전에는 SOLAPI_TEMPLATE_ID_CARE_CHECK가 비어 있어 자동으로 건너뛴다.

export interface CareCheckParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  checkItem:     string  // 점검 항목 (예: 후드 필터 교체)
  checkNote:     string  // 작업 시 확인된 내용 (현장 직원이 적은 근거)
  businessPhone: string  // 업체 연락처
  reportUrl:     string  // 지난 작업 보고서 전체 주소
}

/**
 * 이 템플릿이 지금 발송 가능한 상태인지(승인 완료) 확인한다.
 *
 * 왜 필요한가: 검수중·반려 상태의 템플릿으로 발송하면 솔라피가 요청은 받아주고
 * 나중에 실패로 기록한다(예: 1042). 그러면 우리 코드는 '보냈다'고 표시하는데
 * 고객에겐 아무것도 안 간다 — 몇 달을 모를 수 있는 조용한 실패다.
 * 그래서 크론 한 번당 한 번만 상태를 확인하고, 승인 전이면 아예 시도하지 않는다.
 */
export async function isCareCheckTemplateReady(): Promise<boolean> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const templateId = process.env.SOLAPI_TEMPLATE_ID_CARE_CHECK

  if (!apiKey || !apiSecret || !templateId) return false

  try {
    const service = new SolapiMessageService(apiKey, apiSecret)
    const template = await service.getKakaoAlimtalkTemplate(templateId)
    if (template.status !== 'APPROVED') {
      console.warn(`[Alimtalk] CARE_CHECK 템플릿이 아직 ${template.status} — 알림톡 발송 건너뜀`)
      return false
    }
    return true
  } catch (e) {
    // 상태를 모르면 보내지 않는다. 조용히 사라지는 것보다 문자로 나가거나 사장님이 전화하는 게 낫다
    console.error('[Alimtalk] CARE_CHECK 템플릿 상태 확인 실패:', e)
    return false
  }
}

/** 점검 시기 안내 — 보냈으면 true, 템플릿 미설정이면 false(문자로 폴백) */
export async function sendCareCheckAlimtalk(params: CareCheckParams): Promise<boolean> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_CARE_CHECK
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) return false

  const service = new SolapiMessageService(apiKey, apiSecret)
  const res = await service.sendOne({
    to:   params.customerPhone,
    from: sender,
    type: 'ATA',
    kakaoOptions: {
      pfId,
      templateId,
      variables: {
        '#{업체명}':     params.businessName,
        '#{고객명}':     params.customerName,
        '#{점검항목}':   params.checkItem,
        '#{안내내용}':   params.checkNote,
        '#{업체연락처}': params.businessPhone,
        '#{링크}':       qPathVar(params.reportUrl),
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '지난 작업 보고서 보기',
          linkMo: params.reportUrl,
          linkPc: params.reportUrl,
        },
      ],
    },
  })

  // 접수 코드가 2000번대가 아니면 실패다. 예외를 던지지 않고 실패 코드만 돌려주는 경우가 있어
  // 이걸 안 보면 '보냈다'고 기록해놓고 고객에겐 아무것도 안 간다.
  if (res.statusCode && !res.statusCode.startsWith('2')) {
    console.error(`[Alimtalk] CARE_CHECK 접수 실패: ${res.statusCode} ${res.statusMessage}`)
    return false
  }
  return true
}

// ── 거래처 보고서 2종 ───────────────────────────────────────────────
//
// 재방문 유도·견적 팔로업과 달리 이 둘은 통과 가능성이 높다.
// 계약·작업이라는 '수신자의 액션'에 이어지는 정보성 보고이기 때문.
// ⚠️ 문안에 "이번 달도 잘 부탁드립니다" 같은 인사나 재계약 유도를 넣으면
//    그 순간 광고성이 되어 반려된다. 사실 보고만 담을 것.

export interface MonthlyReportParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  period:        string  // 예: 2026년 8월
  // ⚠️ 회차는 보고서 본문에서 전부 뺐다(계약서에 이미 있는 값이라 담당자에게 정보가 아님).
  //    그런데 승인돼 있는 옛 템플릿 본문에 '작업 완료: #{완료횟수}회'가 박혀 있어, 그 템플릿을
  //    쓰는 동안에는 이 값을 계속 넘겨야 한다(변수를 빼면 미치환으로 발송이 거부된다).
  //    회차를 뺀 v2 템플릿(KA01TP260819133209593TaRB71DIXwK)이 승인되고 환경변수를
  //    갈아끼운 뒤에 이 필드를 지울 것. 여분 변수는 무시되므로 그 전까지 양쪽 다 동작한다.
  visitCount:    number
  reportUrl:     string  // https://qualio.co.kr/q/... 전체 주소
}

/** 거래처 월간 작업 보고서 — 사장님이 검토 후 발송을 누를 때. 템플릿 미설정이면 false */
export async function sendMonthlyReportAlimtalk(params: MonthlyReportParams): Promise<boolean> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_MONTHLY_REPORT
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] MONTHLY_REPORT 템플릿 미설정 — 발송 생략')
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
        '#{고객명}':   params.customerName,
        '#{업체명}':   params.businessName,
        '#{기간}':     params.period,
        '#{완료횟수}': String(params.visitCount),
        '#{링크}':     qPathVar(params.reportUrl),
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '보고서 확인하기',
          linkMo: params.reportUrl,
          linkPc: params.reportUrl,
        },
      ],
    },
  })
  return true
}

export interface OnboardingReportParams {
  customerPhone: string
  customerName:  string
  businessName:  string
  workDate:      string  // 예: 8월 16일
  reportUrl:     string
}

/** 첫 작업(초도) 보고서 — 정기계약 시작 후 첫 작업을 마치고 보낸다. 템플릿 미설정이면 false */
export async function sendOnboardingReportAlimtalk(params: OnboardingReportParams): Promise<boolean> {
  const apiKey     = process.env.SOLAPI_API_KEY
  const apiSecret  = process.env.SOLAPI_API_SECRET
  const sender     = process.env.SOLAPI_SENDER_PHONE
  const templateId = process.env.SOLAPI_TEMPLATE_ID_ONBOARDING_REPORT
  const pfId       = process.env.SOLAPI_KAKAO_PF_ID

  if (!apiKey || !apiSecret || !sender || !templateId || !pfId) {
    console.warn('[Alimtalk] ONBOARDING_REPORT 템플릿 미설정 — 발송 생략')
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
        '#{고객명}': params.customerName,
        '#{업체명}': params.businessName,
        '#{작업일}': params.workDate,
        '#{링크}':   qPathVar(params.reportUrl),
      },
      buttons: [
        {
          buttonType: 'WL' as const,
          buttonName: '보고서 확인하기',
          linkMo: params.reportUrl,
          linkPc: params.reportUrl,
        },
      ],
    },
  })
  return true
}
