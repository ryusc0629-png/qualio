'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { action } from '@/lib/safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import { assertAdmin } from '@/lib/admin/auth'
import { revalidatePath } from 'next/cache'

// 본사에서 오류 신고를 확인하고 닫는다 (신규 → 확인 중 → 해결됨)

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.string().refine((v) => ['new', 'reviewing', 'resolved'].includes(v), {
    message: '상태값이 올바르지 않습니다',
  }),
  adminNote: z.string().max(1000).optional(),
})

export const updateBugReportAction = action
  .schema(updateSchema)
  .action(async ({ parsedInput }) => {
    await assertAdmin()

    // bug_reports는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
    const looseDb = createServiceClient() as unknown as SupabaseClient
    const { error } = await looseDb
      .from('bug_reports')
      .update({
        status: parsedInput.status,
        admin_note: parsedInput.adminNote?.trim() || null,
        // 해결로 옮길 때만 시각을 찍고, 되돌리면 지운다
        resolved_at: parsedInput.status === 'resolved' ? new Date().toISOString() : null,
      })
      .eq('id', parsedInput.id)

    if (error) {
      console.error('[AdminBugReport] 상태 변경 실패:', error)
      throw new Error('[APP] 바꾸지 못했어요. 다시 눌러주세요')
    }

    revalidatePath('/admin/bug-reports')
    return { success: true }
  })
