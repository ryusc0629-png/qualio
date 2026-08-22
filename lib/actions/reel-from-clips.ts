'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { REEL_QUEUED } from '@/lib/reel/queue'
import { revalidatePath } from 'next/cache'

// 작업보고서 없이, 갖고 있던 영상으로 홍보 영상을 만든다.
//
// 왜 필요한가: 릴스는 예약 → 작업보고서 → 릴스로만 이어져 있었다(reports.booking_id가
// NOT NULL). 그래서 퀄리오의 예약·보고서를 안 쓰고 릴스만 쓰려는 업체나, 예전에 찍어둔
// 영상을 쓰려는 경우엔 만들 방법이 아예 없었다.
// ⛔가짜 예약을 만들게 하지 말 것 — 안 한 작업이 건수·매출 통계에 잡혀 숫자가 틀어진다.
//
// 대신 '시공 사례'(biz_posts)를 재료로 삼는다. 사례엔 대본 재료(제목·본문)와 전·후 사진이
// 이미 있고 reel_url 칸도 원래 있었다. 없는 건 영상 클립뿐이라 그것만 채우면 된다.
// 덤으로 이 사례는 홈페이지·견적 페이지에도 그대로 쓰인다 — 한 번 올려 두 곳에 쓴다.

const schema = z.object({
  // 어떤 청소였는지 — 대본의 맥락이 된다. 등록된 서비스 이름을 그대로 받는다.
  cleaningType: z.string().min(1, '어떤 청소였는지 골라주세요').max(60),
  // 한 줄 메모(선택) — 있으면 대본이 훨씬 구체적으로 나온다
  note: z.string().max(500).optional(),
  clipUrls: z.array(z.string().url()).min(1, '영상을 1개 이상 올려주세요').max(3),
  clipDurations: z.array(z.number()).max(3),
  beforeImageUrl: z.string().url('작업 전 사진을 올려주세요'),
  afterImageUrl: z.string().url('작업 후 사진을 올려주세요'),
})

export const createReelFromClipsAction = action
  .schema(schema)
  .action(async ({ parsedInput }) => {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) throw new Error('[APP] 로그인이 필요합니다')

    const db = createServiceClient()
    const { data: profile } = await db
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')
    const businessId = profile.business_id

    const title = parsedInput.cleaningType.trim()
    const note = parsedInput.note?.trim() ?? ''

    // 사례 글 본문 — 사장님이 적은 한 줄이 있으면 그걸 쓰고, 없으면 서비스 이름만으로 간다.
    // ⛔여기서 없는 사실을 지어내지 말 것. 대본은 이 내용 안에서만 만들어진다.
    const content = note || title

    // slug 중복 방지 (기존 시공 사례와 같은 방식)
    const base = `reel-${Date.now().toString(36)}`

    const { data: saved, error } = await db
      .from('biz_posts' as never)
      .insert({
        business_id: businessId,
        slug: base,
        title,
        content,
        summary: note || null,
        image_url: parsedInput.afterImageUrl,
        image_urls: [parsedInput.beforeImageUrl, parsedInput.afterImageUrl],
        ai_generated: false,
        // ⚠️홈페이지에 바로 띄우지 않는다. 사장님이 시공 사례 목록에서 확인하고 공개한다.
        published: false,
        post_type: 'portfolio',
        before_image_urls: [parsedInput.beforeImageUrl],
        after_image_urls: [parsedInput.afterImageUrl],
        work_clip_urls: parsedInput.clipUrls,
        work_clip_durations: parsedInput.clipDurations,
        // 표시만 바꾼다 — 실제 제작(대본+음성 합성 20~40초)은 크론이 한다.
        reel_status: REEL_QUEUED,
        reel_queued_at: new Date().toISOString(),
      } as never)
      .select('id' as never)
      .single() as unknown as { data: { id: string } | null; error: { message: string } | null }

    if (error || !saved) {
      console.error('[Reel] 영상으로 만들기 실패:', error?.message)
      throw new Error('[APP] 저장하지 못했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/marketing')
    return { success: true, postId: saved.id }
  })
