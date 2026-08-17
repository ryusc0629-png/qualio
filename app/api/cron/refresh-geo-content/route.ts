import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { regenerateGeoForBusiness } from '@/lib/seo/regenerate'

// Vercel Cron(daily-maintenance에서 호출): 재료가 바뀐 업체의 홍보 페이지 문구를 다시 만든다.
//
// 왜 필요한가: 제목·소개글은 '홍보 페이지 만들기'를 누른 그 순간의 스냅샷이라,
// 서비스나 주력 고객을 바꿔도 그대로 남는다. 다트클린은 정기청소를 등록하기 이틀 전에
// 찍힌 "입주청소·에어컨청소" 제목을 한 달 내내 검색에 노출했다(2026-08-17 발견).
// 사장님이 버튼을 눌러야만 고쳐지는 구조라면, 대부분은 어긋난 채로 남는다.
//
// 대상은 seo_stale_at > seo_generated_at 인 업체 — 서비스·주력고객·지역이
// 마지막 생성 이후에 바뀐 곳이다. 만들고 나면 seo_stale_at 이 지워져 다음 날엔 빠진다.
// 실행 시각은 daily-maintenance 를 따라 매일 오전 10시(KST).

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// 실행 1회당 재생성 상한 — 업체당 Claude 호출 1회라 비용·시간을 예측 가능하게 묶는다.
// 남은 곳은 다음 날 이어서 처리된다(seo_stale_at 이 그대로 남아 있으므로).
const CAP_PER_RUN = 20

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 문구를 만들려면 Claude 키가 필요 — 없으면 조용히 건너뛴다
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ skipped: 'no-key', regenerated: 0 })
  }

  const db = createServiceClient()

  // 한 번이라도 만든 적이 있는 업체 중, 그 뒤에 재료가 바뀐 곳.
  // 아직 한 번도 안 만든 업체는 대상이 아니다 — 사장님이 직접 시작해야 하는 단계다.
  const { data: candidates } = (await db
    .from('businesses')
    .select('id, name, seo_generated_at, seo_stale_at' as never)
    .not('seo_generated_at', 'is', null)
    .not('seo_stale_at', 'is', null)
    .order('seo_stale_at', { ascending: true }) // 오래 어긋나 있던 곳부터
    .limit(CAP_PER_RUN)) as unknown as {
    data: { id: string; name: string; seo_generated_at: string; seo_stale_at: string }[] | null
  }

  const targets = (candidates ?? []).filter(
    (b) => new Date(b.seo_stale_at) > new Date(b.seo_generated_at),
  )

  const results: { name: string; ok: boolean; reason?: string; seoTitle?: string }[] = []

  // 순차 실행 — 동시에 돌리면 Claude 쪽 속도 제한에 걸린다
  for (const b of targets) {
    const r = await regenerateGeoForBusiness(db, b.id)
    results.push({ name: b.name, ok: r.ok, reason: r.reason, seoTitle: r.seoTitle })
    if (!r.ok) console.error('[Cron] 홍보 문구 재생성 건너뜀:', b.name, r.reason)
  }

  return NextResponse.json({
    candidates: targets.length,
    regenerated: results.filter((r) => r.ok).length,
    results,
  })
}
