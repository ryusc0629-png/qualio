'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { getAdminBusinessIds } from '@/lib/admin/auth'
import { revalidatePath } from 'next/cache'

// 대행 요청 접수
//
// 왜 필요한가: 도메인 연결·검색 등록은 한 번 하면 끝나는 일회성 작업인데,
// 비테크 사장님이 혼자 하려면 계정 만들기·소유확인·DNS까지 넘어야 해서 중간에 막힌다.
// 여기서는 "해주세요" 한 번 받아 본사에 알리는 것까지만 한다. 실제 처리는 사람이 한다.

export const REQUEST_KINDS = ['domain_setup', 'search_indexing', 'google_maps_setup'] as const

const KIND_LABEL: Record<string, string> = {
  domain_setup: '내 인터넷 주소 만들기·연결',
  search_indexing: '네이버·구글 검색 등록',
  google_maps_setup: '구글 지도에 가게 올리기·정리',
}

const requestSchema = z.object({
  kind: z.string().refine((v) => (REQUEST_KINDS as readonly string[]).includes(v), {
    message: '요청 종류가 올바르지 않습니다',
  }),
  note: z.string().max(500).optional(),
})

/** 로그인한 사장님의 업체를 찾는다 */
async function requireBusiness(): Promise<{ businessId: string; businessName: string }> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) throw new Error('[APP] 로그인이 필요합니다')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id, businesses!business_id(name)')
    .eq('id', user.id)
    .maybeSingle()

  const p = profile as { business_id?: string | null; businesses?: { name?: string | null } | null } | null
  if (!p?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')

  return { businessId: p.business_id, businessName: p.businesses?.name ?? '한 업체' }
}

export const createBusinessRequestAction = action
  .schema(requestSchema)
  .action(async ({ parsedInput }) => {
    const { businessId, businessName } = await requireBusiness()
    // business_requests는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
    const looseDb = createServiceClient() as unknown as SupabaseClient
    const note = parsedInput.note?.trim() || null

    // 이미 진행 중인 같은 요청이 있으면 새로 만들지 않는다(연타·재방문 대비)
    const { data: open } = (await looseDb
      .from('business_requests')
      .select('id')
      .eq('business_id', businessId)
      .eq('kind', parsedInput.kind)
      .neq('status', 'done')
      .maybeSingle()) as unknown as { data: { id: string } | null }

    if (open) {
      // 메모만 새로 남겼다면 덧붙여 둔다
      if (note) await looseDb.from('business_requests').update({ note }).eq('id', open.id)
      revalidatePath('/dashboard/settings')
      return { success: true, alreadyOpen: true }
    }

    const { error } = await looseDb.from('business_requests').insert({
      business_id: businessId,
      kind: parsedInput.kind,
      note,
    })

    if (error) {
      console.error('[BusinessRequest] 접수 실패:', error)
      throw new Error('[APP] 접수하지 못했어요. 다시 눌러주세요')
    }

    // 본사 폰에 즉시 알림 — 실패해도 접수는 유지한다
    try {
      const label = KIND_LABEL[parsedInput.kind] ?? '대행'
      const adminBusinessIds = await getAdminBusinessIds()
      await Promise.all(
        adminBusinessIds.map((adminBusinessId) =>
          sendPushToBusiness(adminBusinessId, {
            title: '🙋 대행 요청이 들어왔어요',
            body: `${businessName} · ${label}`,
            url: '/admin/requests',
            tag: 'business-request',
          }),
        ),
      )
    } catch (e) {
      console.error('[BusinessRequest] 관리자 알림 실패:', e)
    }

    revalidatePath('/dashboard/settings')
    return { success: true, alreadyOpen: false }
  })
