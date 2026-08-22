'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { enableModule, disableModule, quoteFor } from '@/lib/config/module-subscription'
import type { ModuleId } from '@/lib/config/modules'

// 모듈 켜기·끄기.
//
// ⛔끌 때 데이터를 지우지 않는다 — 화면만 잠기고 다시 켜면 그대로 돌아온다.
//   "끄면 없어진다"는 인상을 주면 아무도 못 끄고, 못 끄게 만드는 것과
//   안 끄고 싶게 만드는 것은 다르다.

const moduleSchema = z.object({
  moduleId: z.string().refine(
    (v) => ['field', 'marketing', 'client'].includes(v),
    { message: '알 수 없는 기능이에요' },
  ),
  /** 마케팅 전용 — 홍보하는 지역 수 */
  regions: z.number().int().min(1).max(20).optional(),
})

async function getBusinessId(): Promise<string> {
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
  return profile.business_id
}

export const enableModuleAction = action
  .schema(moduleSchema)
  .action(async ({ parsedInput }) => {
    const businessId = await getBusinessId()
    await enableModule(businessId, parsedInput.moduleId as ModuleId, parsedInput.regions ?? 1)
    revalidatePath('/dashboard/settings/modules')
    revalidatePath('/dashboard')
    return { quote: await quoteFor(businessId) }
  })

export const disableModuleAction = action
  .schema(z.object({
    moduleId: z.string().refine(
      (v) => ['field', 'marketing', 'client'].includes(v),
      { message: '알 수 없는 기능이에요' },
    ),
  }))
  .action(async ({ parsedInput }) => {
    const businessId = await getBusinessId()
    await disableModule(businessId, parsedInput.moduleId as ModuleId)
    revalidatePath('/dashboard/settings/modules')
    revalidatePath('/dashboard')
    return { quote: await quoteFor(businessId) }
  })
