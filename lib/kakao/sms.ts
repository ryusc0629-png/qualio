import { SolapiMessageService } from 'solapi'

// 문자(SMS/LMS) 발송 — 알림톡 템플릿 승인이 필요 없는 발송 채널.
// 발신번호(SOLAPI_SENDER_PHONE)만 등록돼 있으면 즉시 발송 가능하다.
// 90바이트를 넘으면 Solapi가 자동으로 LMS(장문)로 처리한다.
export async function sendSms(params: {
  to: string
  text: string
  subject?: string // LMS 제목 (장문일 때만 노출)
}): Promise<boolean> {
  const apiKey    = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const sender    = process.env.SOLAPI_SENDER_PHONE

  if (!apiKey || !apiSecret || !sender) {
    console.warn('[SMS] Solapi 발신 설정 미비 — 문자 발송 생략')
    return false
  }

  try {
    const service = new SolapiMessageService(apiKey, apiSecret)
    await service.sendOne({
      to:   params.to.replace(/[^0-9]/g, ''),
      from: sender,
      text: params.text,
      ...(params.subject ? { subject: params.subject } : {}),
    })
    return true
  } catch (e) {
    console.error('[SMS] 문자 발송 실패:', e)
    return false
  }
}
