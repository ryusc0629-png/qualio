import { createHmac, timingSafeEqual } from 'crypto'

// 광고 문자에 넣는 수신거부 링크의 토큰.
//
// 왜 서명인가: 링크 하나로 남의 번호를 마음대로 수신거부시킬 수 있으면 안 된다.
// DB에 토큰을 따로 저장하지 않고 (업체, 번호)를 서명해 그대로 담는다 — 문자 길이도 짧게 유지된다.

function secret(): string {
  // 이 값은 서버에만 있다. 없으면 링크를 만들지 않는다(문자도 안 나간다).
  return process.env.CRON_SECRET ?? ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, 16)
}

/** 'businessId.phone.서명' 을 URL에 넣을 수 있는 한 덩어리로 */
export function createOptOutToken(businessId: string, phone: string): string | null {
  if (!secret()) return null
  const digits = phone.replace(/[^0-9]/g, '')
  const payload = `${businessId}.${digits}`
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`
}

/** 토큰을 되돌린다. 서명이 안 맞으면 null */
export function readOptOutToken(token: string): { businessId: string; phone: string } | null {
  if (!secret()) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  let payload: string
  try {
    payload = Buffer.from(body, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const [businessId, phone] = payload.split('.')
  if (!businessId || !phone) return null
  return { businessId, phone }
}
