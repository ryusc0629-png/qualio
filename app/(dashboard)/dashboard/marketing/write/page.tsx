import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EditorShell, type EditablePost } from './editor-shell'

// 이미지 업로드·저장은 클라이언트에서 처리하므로 페이지 자체는 가볍다.
export const maxDuration = 60

// 이미 만들어진 글의 수정(?id=) 전용 전체 화면 편집 페이지.
// 백지에서 새로 쓰는 '직접 작성'은 없앴다 — 글은 자동 발행·시공사례가 만들고,
// 사장님은 나가기 전에 확인하고 고치기만 하면 된다. id가 없으면 목록으로 돌려보낸다.
export default async function WritePostPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams
  if (!id) redirect('/dashboard/marketing')

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

  // 내 업체 글만 불러온다(남의 글·없는 글은 목록으로 되돌림)
  const { data: post } = await db
    .from('biz_posts' as never)
    .select('id, title, summary, published, content, image_urls, post_type, before_image_urls, after_image_urls' as never)
    .eq('id' as never, id)
    .eq('business_id' as never, profile.business_id)
    .maybeSingle() as unknown as { data: EditablePost | null }

  if (!post) redirect('/dashboard/marketing')

  return <EditorShell businessId={profile.business_id} post={post} />
}
