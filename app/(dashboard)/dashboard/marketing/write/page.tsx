import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EditorShell, type EditablePost } from './editor-shell'
import { getDailyUsage, POST_DRAFT_SCOPE, POST_DRAFT_DAILY_LIMIT } from '@/lib/ratelimit/daily-quota'

// 이미지 업로드·저장은 클라이언트에서 처리하므로 페이지 자체는 가볍다.
export const maxDuration = 60

// 직접 작성(신규) / 수정(?id=) 전체 화면 편집 페이지
export default async function WritePostPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) redirect('/onboarding')

  // id가 있으면 수정 모드 — 내 업체 글만 불러온다(남의 글·없는 글은 목록으로 되돌림)
  let post: EditablePost | undefined
  if (id) {
    const { data } = await db
      .from('biz_posts' as never)
      .select('id, title, summary, published, content, image_urls, post_type, before_image_urls, after_image_urls' as never)
      .eq('id' as never, id)
      .eq('business_id' as never, profile.business_id)
      .maybeSingle() as unknown as { data: EditablePost | null }

    if (!data) redirect('/dashboard/marketing')
    post = data
  }

  // 오늘 글을 몇 편 더 만들 수 있는지 (한국 날짜 기준, 자정에 초기화)
  const usedToday = await getDailyUsage(db, POST_DRAFT_SCOPE, profile.business_id)
  const remainingToday = Math.max(0, POST_DRAFT_DAILY_LIMIT - usedToday)

  return (
    <EditorShell
      businessId={profile.business_id}
      post={post}
      remainingToday={remainingToday}
      dailyLimit={POST_DRAFT_DAILY_LIMIT}
    />
  )
}
