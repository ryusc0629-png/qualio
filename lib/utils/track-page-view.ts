import 'server-only'
import { headers } from 'next/headers'
import { detectViewSource } from '@/lib/utils/detect-view-source'
import type { createServiceClient } from '@/lib/supabase/server'

type PageType = 'quote' | 'brand_home'

// 공개 페이지(견적·브랜드 홈) 방문을 page_views에 기록
// — referrer/User-Agent로 유입 소스를 감지해 함께 저장
// — 추적 실패가 페이지 렌더를 막지 않도록 try/catch로 감쌈
export async function trackPageView(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  pageType: PageType,
): Promise<void> {
  try {
    const h = await headers()
    const referer = h.get('referer') ?? ''
    const userAgent = h.get('user-agent') ?? ''
    const source = detectViewSource(referer, userAgent)
    // page_views 타입이 database.ts에 아직 없어 단언 사용
    await db.from('page_views' as never).insert({ business_id: businessId, page_type: pageType, source } as never)
  } catch (error) {
    console.error('[PageView] 방문 기록 실패:', error)
  }
}
