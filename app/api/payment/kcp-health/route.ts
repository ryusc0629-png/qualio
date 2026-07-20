import { NextResponse } from 'next/server'

// KCP 결제 환경변수 점검 (비밀값 노출 없이 존재 여부만) — 설정 확인용
export async function GET() {
  return NextResponse.json({
    siteCd: process.env.KCP_SITE_CD ?? null,          // IP910 (비밀 아님)
    hasCert: !!process.env.KCP_CERT_PEM_BASE64,
    hasKey: !!process.env.KCP_PRIVATE_KEY_BASE64,
    host: process.env.KCP_PAY_HOST ?? null,
    ready: !!(process.env.KCP_SITE_CD && process.env.KCP_CERT_PEM_BASE64 && process.env.KCP_PRIVATE_KEY_BASE64),
  })
}
