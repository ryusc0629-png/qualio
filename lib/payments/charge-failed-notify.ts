import { SolapiMessageService } from 'solapi'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'

// 정기결제 자동청구가 실패했을 때 사장님에게 알린다.
//
// 왜 필요한가:
// 청구가 실패하면 구독이 past_due가 되고 7일 뒤 서비스가 잠긴다. 그런데 그동안
// 나가는 알림이 하나도 없었다. 사장님(비테크 40~60대)은 대시보드를 매일 열지 않으므로,
// "잘 쓰고 있었는데 어느 날 갑자기 잠겼다"는 CS로 돌아온다. 카드 유효기간 만료·한도 초과는
// 아주 흔한 일이라 업체가 늘면 매달 몇 건씩 난다.
//
// ⚠️ 알림톡을 쓰지 않는 이유: 승인된 템플릿 16종이 전부 '고객사 → 그 고객'용이다.
//    결제 실패는 '퀄리오 → 고객사 대표'라 새 템플릿이 필요한데 카카오 심사에 며칠 걸린다.
//    문자(LMS)는 템플릿 승인이 필요 없고, 이 발송은 퀄리오가 자기 고객에게 보내는 것이라
//    발신번호가 퀄리오 번호여도 어색하지 않다(고객사 대신 보내는 알림톡과 상황이 다르다).
//
// ⚠️ 중복 발송 걱정 없음: 청구 실패한 구독은 status가 past_due로 바뀌고,
//    chargeDueSubscriptions()는 status='active'만 조회하므로 이 알림은 건당 한 번만 나간다.

interface ChargeFailedParams {
  businessId: string
  planLabel: string
  amount: number
}

/** 결제 실패를 사장님 폰(문자)과 대표 푸시로 알린다. 알림 실패가 청구 로직을 막지 않는다. */
export async function notifyChargeFailed({ businessId, planLabel, amount }: ChargeFailedParams): Promise<void> {
  const db = createServiceClient()

  const { data: business } = await db
    .from('businesses')
    .select('name, phone')
    .eq('id', businessId)
    .maybeSingle()

  const amountText = `${amount.toLocaleString('ko-KR')}원`

  // 1) 대표 웹푸시 — 앱을 켜두신 분에겐 가장 빠르다
  await sendPushToBusiness(businessId, {
    title: '카드 결제가 되지 않았어요',
    body: `${planLabel} 플랜 ${amountText} 결제에 실패했어요. 카드를 다시 등록해주세요.`,
    url: '/upgrade',
  }).catch((e) => console.error('[Billing notify] 푸시 실패:', businessId, e))

  // 2) 문자(LMS) — 푸시를 안 켠 사장님에게도 반드시 닿아야 한다
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const sender = process.env.SOLAPI_SENDER_PHONE
  const to = business?.phone?.replace(/[^0-9]/g, '')

  if (!apiKey || !apiSecret || !sender) {
    console.error('[Billing notify] Solapi 미설정 — 문자 생략:', businessId)
    return
  }
  if (!to) {
    console.error('[Billing notify] 업체 연락처 없음 — 문자 생략:', businessId)
    return
  }

  // 무엇이 일어났는지 · 언제까지 · 무엇을 하면 되는지 순서로 적는다(비테크 사장님 기준).
  // 겁주지 않되 기한은 분명히 — "지금은 그대로 쓸 수 있다"를 먼저 말해 불안을 줄인다.
  const text = [
    '[퀄리오] 카드 결제가 되지 않았어요',
    '',
    `${planLabel} 플랜 ${amountText} 결제에 실패했어요.`,
    '카드 유효기간이 지났거나 한도를 넘은 경우가 많아요.',
    '',
    '지금은 그대로 쓰실 수 있고, 7일 안에 카드를 다시 등록해주시면 계속 이어집니다.',
    '',
    '카드 등록: https://qualio.co.kr/upgrade',
    '도움이 필요하시면 이 번호로 연락 주세요.',
  ].join('\n')

  try {
    const service = new SolapiMessageService(apiKey, apiSecret)
    await service.sendOne({ to, from: sender, type: 'LMS', subject: '퀄리오 결제 실패 안내', text })
  } catch (e) {
    console.error('[Billing notify] 문자 발송 실패:', businessId, e)
  }
}
