import { loadCredentials, signData } from './kcp'

// NHN KCP 정기결제(빌키 / BATCH) — 서버 전용 모듈
//
// 흐름:
//  (1) 빌키 발급: 표준결제창을 BATCH 모드로 열어 카드 인증(거래등록→결제창→ret_URL)
//      → 승인 시 batch_key(빌키) 수신 → subscriptions.billing_key 저장 (+ 첫 달 결제 동시)
//  (2) 매달 자동청구: 저장한 batch_key 로 서버→서버 결제 승인(결제창 없음) — cron 실행
//
// ⚠️ [KCP-SPEC] 주석 지점은 KCP 정기결제 "개통 후 받는 REST 연동 문서"로 확정 필요:
//    - 서버간 배치결제 엔드포인트 경로
//    - 승인 응답의 빌키 필드명(관행: batch_key)
//    - 서명 평문(kcp_sign_data) 구성 순서
//    나머지(자격증명·서명방식·거래등록/결제창)는 일반결제와 동일해 그대로 재사용한다.

// [KCP-SPEC] 서버간 배치(빌링) 결제 엔드포인트 — 개통 문서로 확정.
//  (일반결제 승인과 동일 게이트웨이를 쓰는 경우가 많아 기본값을 그것으로 둠)
const KCP_BATCH_PAY_PATH = '/gw/enc/v1/payment'

// ── (1) 빌키 발급 승인 ─────────────────────────────────────────────
// ret_URL(kcp-billing-return)에서 BATCH 인증 결과를 받은 직후 호출.
// 성공 시 batch_key(빌키)와 첫 결제 거래번호(tno)를 함께 반환한다.
export interface KcpBillingKeyParams {
  encData: string
  encInfo: string
  tranCd: string
  ordrIdxx: string
  ordrMony: number // 가맹점 DB 원본 금액(위변조 방지)
}

export interface KcpBillingKeyResult {
  ok: boolean
  resCd: string
  resMsg?: string
  batchKey?: string   // 빌키 (batch_key) — 이후 자동청구에 사용, 안전하게 저장
  tno?: string        // 첫 결제 거래번호(빌키발급과 동시 결제 시)
  amount?: number
  cardMasked?: string // 마스킹된 카드번호(표시용)
  raw: Record<string, unknown>
}

export async function approveBillingKeyIssue(p: KcpBillingKeyParams): Promise<KcpBillingKeyResult> {
  const { siteCd, certPem, host } = loadCredentials()
  const body = {
    site_cd: siteCd,
    kcp_cert_info: certPem,
    enc_data: p.encData,
    enc_info: p.encInfo,
    tran_cd: p.tranCd,
    ordr_idxx: p.ordrIdxx,
    ordr_mony: String(p.ordrMony),
    // [KCP-SPEC] 배치(빌키) 결제 타입 코드 — 카드 일반결제는 PACA. 배치는 개통 문서로 확정.
    pay_type: 'BACC',
  }
  const res = await fetch(`${host}/gw/enc/v1/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const resCd = String(raw.res_cd ?? '')
  // [KCP-SPEC] 빌키 응답 필드명 확인 (관행: batch_key)
  const batchKey = (raw.batch_key ?? raw.bt_batch_key) as string | undefined
  const amountRaw = raw.amount ?? raw.good_mny
  return {
    ok: resCd === '0000' && !!batchKey,
    resCd,
    resMsg: raw.res_msg as string | undefined,
    batchKey,
    tno: raw.tno as string | undefined,
    amount: amountRaw != null ? Number(amountRaw) : undefined,
    cardMasked: (raw.card_no ?? raw.card_num) as string | undefined,
    raw,
  }
}

// ── (2) 빌키로 자동청구(서버간) ────────────────────────────────────
// 결제창 없이 서버에서 직접 승인. 매달 cron이 만료 도래 구독에 대해 호출.
export interface KcpChargeParams {
  batchKey: string
  ordrIdxx: string   // 이번 청구용 새 주문번호
  goodMny: number
  goodName: string
  payType?: string
}

export interface KcpChargeResult {
  ok: boolean
  resCd: string
  resMsg?: string
  tno?: string
  amount?: number
  raw: Record<string, unknown>
}

export async function chargeWithBillingKey(p: KcpChargeParams): Promise<KcpChargeResult> {
  const { siteCd, certPem, host } = loadCredentials()
  // [KCP-SPEC] 배치결제 서명 평문 순서 — 개통 문서로 확정.
  //  (관행: site_cd^batch_key^ordr_idxx^good_mny)
  const signPlain = `${siteCd}^${p.batchKey}^${p.ordrIdxx}^${p.goodMny}`
  const body = {
    site_cd: siteCd,
    kcp_cert_info: certPem,
    kcp_sign_data: signData(signPlain),
    batch_key: p.batchKey,
    ordr_idxx: p.ordrIdxx,
    good_mny: String(p.goodMny),
    good_name: p.goodName,
    pay_method: 'BATCH',
    pay_type: p.payType ?? 'BACC',
  }
  const res = await fetch(`${host}${KCP_BATCH_PAY_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const resCd = String(raw.res_cd ?? '')
  const amountRaw = raw.amount ?? raw.good_mny
  return {
    ok: resCd === '0000',
    resCd,
    resMsg: raw.res_msg as string | undefined,
    tno: raw.tno as string | undefined,
    amount: amountRaw != null ? Number(amountRaw) : undefined,
    raw,
  }
}
