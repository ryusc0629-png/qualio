import { sendQuoteAlimtalk, type QuoteSentParams } from './alimtalk'
import { sendSms } from './sms'

// 견적을 고객에게 전달 — 카카오 알림톡 우선, 미설정·실패 시 문자(SMS/LMS)로 폴백.
// 알림톡 템플릿(SOLAPI_TEMPLATE_ID_QUOTE_SENT)이 승인·설정되면 코드 수정 없이 자동으로 카톡 발송된다.
// 반환값으로 실제 사용된 채널을 알려준다('none'이면 발신 설정 자체가 없어 아무것도 못 보냄).
export async function sendQuoteToCustomer(
  params: QuoteSentParams,
): Promise<'kakao' | 'sms' | 'none'> {
  const sentByKakao = await sendQuoteAlimtalk(params)
  if (sentByKakao) return 'kakao'

  const sentBySms = await sendSms({
    to:      params.customerPhone,
    subject: `${params.businessName} 견적 안내`,
    text:    buildQuoteSmsText(params),
  })
  return sentBySms ? 'sms' : 'none'
}

// 문자용 견적 본문 — 알림톡과 동일 정보를 순수 텍스트로 구성
function buildQuoteSmsText(p: QuoteSentParams): string {
  const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
  const spaceLabel = p.spaceSize ? ` ${p.spaceSize}평` : ''

  // 플랜 미설정 업체는 3단계 가격이 모두 같으므로 단일 금액으로 안내
  const singlePrice = p.betterPrice === p.goodPrice && p.bestPrice === p.goodPrice
  const priceBlock = singlePrice
    ? `· 예상 견적: ${won(p.goodPrice)}`
    : [
        `· 기본가: ${won(p.goodPrice)}`,
        `· 추천가: ${won(p.betterPrice)}`,
        `· 프리미엄: ${won(p.bestPrice)}`,
      ].join('\n')

  return [
    `[${p.businessName}] ${p.customerName}님, 요청하신 견적입니다.`,
    ``,
    `· 서비스: ${p.cleaningType}${spaceLabel}`,
    priceBlock,
    ``,
    `자세히 보기 👇`,
    p.quoteUrl,
    p.businessPhone ? `문의: ${p.businessPhone}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
    .trim()
}
