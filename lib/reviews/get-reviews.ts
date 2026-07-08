import type { createServiceClient } from '@/lib/supabase/server'

export interface PublicReview {
  rating: number
  comment: string | null
  customerName: string  // 마스킹된 표시용 이름
  createdAt: string
}

export interface ReviewSummary {
  count: number          // 공개 후기 수
  avg: number            // 평균 별점 (소수 1자리)
  items: PublicReview[]  // 한 줄 후기가 있는 것만(전시용)
}

// 이름 마스킹 — "김민수" → "김○○", "이서" → "이○" (첫 글자만 노출)
function maskName(name: string | null): string {
  const n = (name ?? '').trim()
  if (!n) return '고객'
  if (n.length === 1) return n
  return n[0] + '○'.repeat(Math.min(n.length - 1, 2))
}

// 공개 후기(4~5점) 요약 — 견적 페이지·브랜드 홈의 사회적 증거로 사용
export async function getReviewSummary(
  db: ReturnType<typeof createServiceClient>,
  businessId: string,
  limit = 6,
): Promise<ReviewSummary> {
  try {
    const { data } = await db
      .from('reviews' as never)
      .select('rating, comment, customer_name, created_at' as never)
      .eq('business_id' as never, businessId)
      .eq('is_public' as never, true)
      .order('created_at' as never, { ascending: false })
      .limit(200) as unknown as {
        data: { rating: number; comment: string | null; customer_name: string | null; created_at: string }[] | null
      }

    const rows = data ?? []
    const count = rows.length
    const avg = count > 0 ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0
    const items: PublicReview[] = rows
      .filter((r) => r.comment && r.comment.trim())
      .slice(0, limit)
      .map((r) => ({
        rating: r.rating,
        comment: r.comment,
        customerName: maskName(r.customer_name),
        createdAt: r.created_at,
      }))

    return { count, avg, items }
  } catch (e) {
    console.error('[Review] 후기 요약 조회 실패:', e)
    return { count: 0, avg: 0, items: [] }
  }
}
