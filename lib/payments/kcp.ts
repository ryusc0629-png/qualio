import crypto from 'crypto'

// NHN KCP 결제 (직접연동, REST API) — 서버 전용 모듈
// 흐름: 거래등록(treg) → 결제창(pay_url 리다이렉트) → 승인(payment)
// 인증서/개인키는 서버 env(base64)에서만 로드 — 클라이언트 노출 금지

interface KcpCredentials {
  siteCd: string
  certPem: string      // kcp_cert_info 로 전달할 인증서 PEM 전체
  privateKey: string   // 서명용 개인키 PEM
  host: string         // 결제 API 호스트 (운영: https://spl.kcp.co.kr)
}

function loadCredentials(): KcpCredentials {
  const siteCd = process.env.KCP_SITE_CD
  const certB64 = process.env.KCP_CERT_PEM_BASE64
  const keyB64 = process.env.KCP_PRIVATE_KEY_BASE64
  const host = process.env.KCP_PAY_HOST ?? 'https://spl.kcp.co.kr'
  if (!siteCd || !certB64 || !keyB64) {
    throw new Error('[KCP] 결제 자격증명 환경변수가 없습니다')
  }
  return {
    siteCd,
    certPem: Buffer.from(certB64, 'base64').toString('utf-8'),
    privateKey: Buffer.from(keyB64, 'base64').toString('utf-8'),
    host,
  }
}

// SHA256withRSA 서명 → Base64 (kcp_sign_data)
export function signData(plain: string): string {
  const { privateKey } = loadCredentials()
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(plain, 'utf-8')
  signer.end()
  return signer.sign(privateKey, 'base64')
}

export interface KcpRegisterParams {
  ordrIdxx: string   // 주문번호 {businessId}_{planId}_{timestamp}
  goodMny: number    // 결제금액(원)
  goodName: string   // 상품명
  payMethod?: string // 기본 CARD
  regType?: string   // 기본 web
  retUrl: string     // 인증결과 수신 서버 URL (KCP가 폼 POST)
}

export interface KcpRegisterResult {
  ok: boolean
  payUrl?: string
  tranCd?: string
  raw: Record<string, unknown>
}

// 1) 거래등록 — 결제창 URL(pay_url) 획득
export async function registerPayment(p: KcpRegisterParams): Promise<KcpRegisterResult> {
  const { siteCd, certPem, host } = loadCredentials()
  const payMethod = p.payMethod ?? 'CARD'
  const regType = p.regType ?? 'web'
  // 서명 대상: site_cd^good_mny^pay_method^reg_type^ordr_idxx
  const signPlain = `${siteCd}^${p.goodMny}^${payMethod}^${regType}^${p.ordrIdxx}`
  const body = {
    site_cd: siteCd,
    kcp_cert_info: certPem,
    kcp_sign_data: signData(signPlain),
    ordr_idxx: p.ordrIdxx,
    pay_method: payMethod,
    good_mny: String(p.goodMny),
    good_name: p.goodName,
    reg_type: regType,
    ret_URL: p.retUrl,
  }
  const res = await fetch(`${host}/std/brpay/treg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const payUrl = typeof raw.pay_url === 'string' ? raw.pay_url : undefined
  return { ok: !!payUrl, payUrl, tranCd: raw.tran_cd as string | undefined, raw }
}

export interface KcpApproveParams {
  encData: string
  encInfo: string
  tranCd: string
  ordrIdxx: string
  ordrMony: number   // 가맹점 DB 원본 금액(위변조 방지)
  payType?: string   // 카드=PACA
}

export interface KcpApproveResult {
  ok: boolean
  resCd: string
  resMsg?: string
  tno?: string        // KCP 거래번호
  amount?: number     // 실제 승인 금액
  raw: Record<string, unknown>
}

// 2) 결제 승인 — ret_URL 수신 즉시 호출
export async function approvePayment(p: KcpApproveParams): Promise<KcpApproveResult> {
  const { siteCd, certPem, host } = loadCredentials()
  const body = {
    site_cd: siteCd,
    kcp_cert_info: certPem,
    enc_data: p.encData,
    enc_info: p.encInfo,
    tran_cd: p.tranCd,
    ordr_idxx: p.ordrIdxx,
    ordr_mony: String(p.ordrMony),
    pay_type: p.payType ?? 'PACA',
  }
  const res = await fetch(`${host}/gw/enc/v1/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const resCd = String(raw.res_cd ?? '')
  const amountRaw = raw.amount ?? raw.good_mny
  const amount = amountRaw != null ? Number(amountRaw) : undefined
  return {
    ok: resCd === '0000',
    resCd,
    resMsg: raw.res_msg as string | undefined,
    tno: raw.tno as string | undefined,
    amount,
    raw,
  }
}
