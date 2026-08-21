import { NextRequest, NextResponse } from 'next/server'

// Vercel Hobby 플랜은 cron을 최대 2개까지만 실행한다.
// auto-post(마케팅 자동 발행)를 반드시 살리기 위해, 나머지 알림 성격의
// cron 4개를 이 단일 엔드포인트에서 한 번에 순차 실행한다.
// → vercel.json 의 cron 은 auto-post + daily-maintenance 2개로 유지된다.
//
// 각 하위 작업은 기존 라우트를 그대로 내부 호출(self-fetch)하므로
// 기존 로직은 전혀 수정하지 않는다. 한 작업이 실패해도 나머지는 계속 진행한다.

// 알림톡 발송 등 외부 호출이 포함되므로 실행 시간을 넉넉히 확보
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// 실행할 하위 cron 목록 (실행 순서는 영향 없음 — 병렬 실행)
const SUB_TASKS = [
  // 자동 발행 안전망(catch-up) — 오전 9시(00:00 UTC) auto-post cron이 배포 겹침 등으로
  // 누락되면, 1시간 뒤 이 10시(01:00 UTC) 실행에서 보충 발행한다.
  // auto-post는 멱등: 9시에 이미 발행됐으면 needed=0으로 건너뛰므로 중복 발행 없음.
  'auto-post',
  // 이용기간이 끝난 정기결제 구독을 저장된 빌키로 재청구(2026-08-19 연결).
  // 이게 없으면 첫 달만 결제되고 둘째 달부터 요금이 안 빠진 채 구독이 조용히 만료된다.
  // 중복 청구는 주문번호(구독×이용기간) 선점으로 막는다 — billing-charge.ts 참고.
  'charge-subscriptions',
  'expire-quotes',
  // 내일 방문하는 고객에게 예약 리마인더 알림톡. 템플릿은 승인돼 있었는데
  // 이 목록에도 vercel.json crons에도 없어서 한 번도 실행된 적이 없었다(2026-08-16 발견).
  'remind',
  'review-request',
  'quote-followup',
  'reengagement',
  'followup-reminder', // 오늘 연락할 B2B 거래처 대표 폰 푸시 알림
  'remind-workers', // 내일 배정된 현장을 직원·도급사 폰(현장 앱)에 미리 푸시
  'generate-recurring-visits', // 정기계약 → 향후 방문 자동 생성(롤링 60일)
  'metrics-snapshot', // 본사 지표 월별 스냅샷(NRR/코호트 기반)
  'prepare-monthly-reports', // 매월 초 지난달 거래처 리포트 준비 + 대표 푸시(검토 후 발송)
  // 첫 작업이 끝났는데 초도 리포트를 안 보낸 정기계약을 대표에게 알린다(계약당 1회)
  'onboarding-report-reminder',
  // 보고서에 적어둔 '앞으로 손봐야 할 것'의 시점이 되면 대표에게 알린다
  'care-reminder',
  // 현장이 올리고 대표가 승인한 '다음에 제안할 서비스' — 그 날짜가 되면 고객에게 광고 문자.
  // 자동 발송이 법으로 막힌 건은 보내지 않고 대표에게 되돌려 직접 연락하게 한다.
  'suggestion-followup',
  // 현장이 올린 영상으로 홍보 영상을 만든다(대기열 → 실제 제작).
  // 한 건에 20~40초가 걸려 사용자 요청 안에서는 못 한다.
  'make-reels',
  'geo-measure', // AI 검색 노출률 주기 측정(7일 경과 업체만·상한 내, 키 없으면 휴면)
  'pricing-benchmark', // 객단가 상위 업체의 3단계 플랜 인상률·구성 집계(가격 가이드용)
  // 서비스·주력고객이 바뀐 업체의 홈페이지 제목·소개글을 다시 만든다.
  // 사장님이 버튼을 눌러야만 바뀌던 구조라 옛 문구가 그대로 검색에 노출되고 있었다.
  'refresh-geo-content',
] as const

export async function GET(request: NextRequest) {
  // Vercel Cron 표준 인증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secret = process.env.CRON_SECRET ?? ''
  // ★ self-fetch 대상은 반드시 '공개 도메인'(qualio.co.kr)을 써야 한다.
  //   크론이 호출할 때 request.url 의 origin 은 Vercel 배포 보호(SSO)가 걸린 *.vercel.app
  //   배포 URL이다. 거기로 self-fetch 하면 SSO 로그인(vercel.com/sso-api)으로 302 리다이렉트되어
  //   auto-post(자동 발행 안전망)를 포함한 모든 하위 작업이 실제로 실행되지 못하고 조용히 실패한다.
  //   공개 도메인은 보호가 없어 200으로 정상 실행된다. (코드베이스 공통 패턴과 동일)
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr').replace(/\/$/, '')

  // 하위 라우트마다 인증 방식이 달라 모든 헤더·쿼리를 함께 전달
  const headers = {
    authorization: `Bearer ${secret}`,
    'x-cron-secret': secret,
  }

  const settled = await Promise.allSettled(
    SUB_TASKS.map(async (task) => {
      const res = await fetch(`${origin}/api/cron/${task}?secret=${encodeURIComponent(secret)}`, {
        headers,
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      return { task, status: res.status, body }
    })
  )

  const results = settled.map((r, i) => {
    const task = SUB_TASKS[i]
    if (r.status === 'fulfilled') {
      const ok = r.value.status === 200
      // 비정상 응답(302 SSO 리다이렉트·401·5xx 등)도 로그로 드러낸다 — 조용한 실패 방지
      if (!ok) console.error(`[Cron] daily-maintenance 하위 작업 비정상 응답 (${task}): status=${r.value.status}`)
      return { task, ok, status: r.value.status, body: r.value.body }
    }
    const message = r.reason instanceof Error ? r.reason.message : '알 수 없는 오류'
    console.error(`[Cron] daily-maintenance 하위 작업 실패 (${task}):`, message)
    return { task, ok: false, error: message }
  })

  const failed = results.filter((r) => !r.ok).length
  return NextResponse.json({
    date: new Date().toISOString(),
    processed: SUB_TASKS.length,
    failed,
    results,
  })
}
