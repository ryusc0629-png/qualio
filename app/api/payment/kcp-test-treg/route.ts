import { NextRequest, NextResponse } from 'next/server'
import { registerPayment } from '@/lib/payments/kcp'

// [임시 진단] KCP 거래등록만 실호출해 서명·인증서·API 형식이 맞는지 확인 (결제 아님, 과금 없음)
// 검증 후 삭제 예정. 토큰 게이트.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('token') !== 'kcptest2607') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host')
  try {
    const r = await registerPayment({
      ordrIdxx: `TEST${Date.now().toString(36)}`.toUpperCase(),
      goodMny: 100,
      goodName: '퀄리오 결제 연동 테스트',
      retUrl: `${proto}://${host}/api/payment/kcp-return`,
      failUrl: `${proto}://${host}/upgrade/success?status=fail`,
    })
    return NextResponse.json({ ok: r.ok, payUrl: r.payUrl ?? null, raw: r.raw })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
