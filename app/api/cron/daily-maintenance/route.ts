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
  'expire-quotes',
  'review-request',
  'quote-followup',
  'reengagement',
  'followup-reminder', // 오늘 연락할 B2B 거래처 대표 폰 푸시 알림
  'metrics-snapshot', // 본사 지표 월별 스냅샷(NRR/코호트 기반)
] as const

export async function GET(request: NextRequest) {
  // Vercel Cron 표준 인증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secret = process.env.CRON_SECRET ?? ''
  // 같은 배포 호스트로 호출 — 배포 URL 변경에 영향받지 않음
  const origin = new URL(request.url).origin

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
      return { task, ok: r.value.status === 200, status: r.value.status, body: r.value.body }
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
