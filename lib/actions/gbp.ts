'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// 구글 비즈니스 프로필 점검 항목 체크 — 구글 쪽 데이터라 우리가 자동으로 읽을 수 없어
// 사장님이 한 번 확인하고 켜 두는 값이다. (Places 키가 들어오면 자동 조회로 대체 가능)
const GBP_KEYS = ['open', 'hours', 'category', 'rating']

const schema = z.object({
  key: z.string().refine((v) => GBP_KEYS.includes(v), '알 수 없는 항목입니다'),
  done: z.boolean(),
})

export const toggleGbpCheckAction = action.schema(schema).action(async ({ parsedInput }) => {
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

  // 기존 값 위에 한 칸만 덮어쓴다 — 통째로 갈아끼우면 동시에 두 개를 누를 때 하나가 날아간다
  const { data: current } = (await db
    .from('businesses')
    .select('gbp_checklist' as never)
    .eq('id', profile.business_id)
    .maybeSingle()) as unknown as { data: { gbp_checklist: Record<string, boolean> | null } | null }

  const next = { ...(current?.gbp_checklist ?? {}), [parsedInput.key]: parsedInput.done }

  const { error } = await db
    .from('businesses')
    .update({ gbp_checklist: next } as never)
    .eq('id', profile.business_id)

  if (error) throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')

  revalidatePath('/dashboard/marketing')
  return { success: true }
})
