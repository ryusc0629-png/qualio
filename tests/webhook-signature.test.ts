import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyWebhookSignature } from '@/lib/payments/webhook-signature'

// 웹훅 서명 검증 — 여기가 뚫리면 아무나 "결제 완료" 요청을 보내 구독을 공짜로 켤 수 있다.

const SECRET = 'whsec_' + Buffer.from('퀄리오 테스트 시크릿 값').toString('base64')
const ID = 'msg_test_1'

function sign(body: string, timestamp: string, secret = SECRET) {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const mac = crypto
    .createHmac('sha256', Buffer.from(raw, 'base64'))
    .update(`${ID}.${timestamp}.${body}`)
    .digest('base64')
  return `v1,${mac}`
}

const nowSeconds = () => Math.floor(Date.now() / 1000).toString()

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ type: 'Transaction.Paid', data: { paymentId: 'QR123' } })

  it('올바른 서명은 통과한다', () => {
    const ts = nowSeconds()
    const r = verifyWebhookSignature({ secret: SECRET, body, id: ID, timestamp: ts, signature: sign(body, ts) })
    expect(r.ok).toBe(true)
  })

  it('본문이 한 글자라도 바뀌면 거부한다', () => {
    const ts = nowSeconds()
    const signature = sign(body, ts)
    const tampered = JSON.stringify({ type: 'Transaction.Paid', data: { paymentId: 'QR999' } })
    const r = verifyWebhookSignature({ secret: SECRET, body: tampered, id: ID, timestamp: ts, signature })
    expect(r.ok).toBe(false)
  })

  it('다른 시크릿으로 만든 서명은 거부한다', () => {
    const ts = nowSeconds()
    const other = 'whsec_' + Buffer.from('남의 시크릿').toString('base64')
    const r = verifyWebhookSignature({ secret: SECRET, body, id: ID, timestamp: ts, signature: sign(body, ts, other) })
    expect(r.ok).toBe(false)
  })

  it('오래된 요청(재전송)은 거부한다', () => {
    const old = (Math.floor(Date.now() / 1000) - 60 * 60).toString()
    const r = verifyWebhookSignature({ secret: SECRET, body, id: ID, timestamp: old, signature: sign(body, old) })
    expect(r.ok).toBe(false)
  })

  it('서명 헤더가 없으면 거부한다', () => {
    const r = verifyWebhookSignature({ secret: SECRET, body, id: ID, timestamp: nowSeconds(), signature: null })
    expect(r.ok).toBe(false)
  })

  it('시크릿 교체 기간처럼 서명이 여러 개면 하나만 맞아도 통과한다', () => {
    const ts = nowSeconds()
    const signature = `v1,${'a'.repeat(44)} ${sign(body, ts)}`
    const r = verifyWebhookSignature({ secret: SECRET, body, id: ID, timestamp: ts, signature })
    expect(r.ok).toBe(true)
  })
})
