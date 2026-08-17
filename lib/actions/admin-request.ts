'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import { assertAdmin } from '@/lib/admin/auth'
import { revalidatePath } from 'next/cache'

// 본사에서 대행 요청 상태를 옮긴다 (접수 → 처리 중 → 완료)

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.string().refine((v) => ['requested', 'in_progress', 'done'].includes(v), {
    message: '상태값이 올바르지 않습니다',
  }),
  adminNote: z.string().max(1000).optional(),
})

export const updateBusinessRequestAction = action
  .schema(updateSchema)
  .action(async ({ parsedInput }) => {
    await assertAdmin()

    // business_requests는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
    const looseDb = createServiceClient() as unknown as SupabaseClient
    const { error } = await looseDb
      .from('business_requests')
      .update({
        status: parsedInput.status,
        admin_note: parsedInput.adminNote?.trim() || null,
        // 완료로 옮길 때만 시각을 찍고, 되돌리면 지운다
        done_at: parsedInput.status === 'done' ? new Date().toISOString() : null,
      })
      .eq('id', parsedInput.id)

    if (error) {
      console.error('[AdminRequest] 상태 변경 실패:', error)
      throw new Error('[APP] 바꾸지 못했어요. 다시 눌러주세요')
    }

    revalidatePath('/admin/requests')
    return { success: true }
  })
