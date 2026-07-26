import { sendQuoteAlimtalk, type QuoteSentParams } from './alimtalk'

// 견적을 고객에게 전달 — 카카오 알림톡으로만 발송한다.
// 알림톡 템플릿(SOLAPI_TEMPLATE_ID_QUOTE_SENT)이 승인·설정되면 코드 수정 없이 자동으로 카톡이 나간다.
// ⚠️ 문자(SMS) 폴백은 의도적으로 제거함 — 발신번호(사장님 개인번호)가 고객에게 노출되기 때문.
//    따라서 알림톡이 아직 심사 중이거나 실패하면 아무것도 보내지 않는다('none').
export async function sendQuoteToCustomer(
  params: QuoteSentParams,
): Promise<'kakao' | 'none'> {
  const sentByKakao = await sendQuoteAlimtalk(params)
  return sentByKakao ? 'kakao' : 'none'
}
