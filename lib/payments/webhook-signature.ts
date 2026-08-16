import crypto from 'crypto'

// 포트원 웹훅 서명 검증 (Standard Webhooks 규격).
// 포트원 콘솔에서 발급한 웹훅 시크릿으로, 요청이 정말 포트원에서 온 것인지 확인한다.
// 이 검증이 없으면 누구나 우리 웹훅 주소로 "결제 완료" 요청을 보내 구독을 공짜로 켤 수 있다.
//
// 규격: signature = base64(HMAC-SHA256(secret, `${webhook-id}.${webhook-timestamp}.${본문}`))
// 헤더 webhook-signature 는 "v1,<서명> v1,<서명2>" 처럼 여러 개가 올 수 있다(시크릿 교체 기간).

// 재전송(replay) 공격 방지 — 이 시간 이상 오래된 요청은 거부
const TOLERANCE_SECONDS = 5 * 60

export type VerifyWebhookResult = { ok: true } | { ok: false; reason: string }

export function verifyWebhookSignature(params: {
  secret: string
  body: string
  id: string | null
  timestamp: string | null
  signature: string | null
}): VerifyWebhookResult {
  const { secret, body, id, timestamp, signature } = params
  if (!id || !timestamp || !signature) return { ok: false, reason: '서명 헤더 누락' }

  // 타임스탬프는 초 단위 유닉스 시간
  const sent = Number(timestamp)
  if (!Number.isFinite(sent)) return { ok: false, reason: '타임스탬프 형식 오류' }
  const drift = Math.abs(Math.floor(Date.now() / 1000) - sent)
  if (drift > TOLERANCE_SECONDS) return { ok: false, reason: '오래된 요청(재전송 의심)' }

  // 시크릿은 whsec_ 접두사 뒤에 base64로 온다
  const rawSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const key = Buffer.from(rawSecret, 'base64')

  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')

  // 헤더에 담긴 서명 후보 중 하나라도 일치하면 통과
  const candidates = signature
    .split(' ')
    .map((part) => (part.includes(',') ? part.split(',')[1] : part))
    .filter(Boolean)

  const matched = candidates.some((candidate) => safeEqual(candidate, expected))
  return matched ? { ok: true } : { ok: false, reason: '서명 불일치' }
}

// 타이밍 공격 방지용 상수시간 비교
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
