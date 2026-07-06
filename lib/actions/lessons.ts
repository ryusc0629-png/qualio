'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { action } from '@/lib/safe-action'
import { assertAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

// Vimeo 주소를 통째로 붙여넣어도 영상 ID만 뽑아낸다 (예: https://vimeo.com/76979871 → 76979871)
function normalizeVimeoId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/(\d{6,})/)
  return match ? match[1] : trimmed
}

// 강의 저장 화면들을 갱신 (배움터·관리자·개별 강의)
function revalidateLessons() {
  revalidatePath('/ops')
  revalidatePath('/admin/lessons')
}

const upsertSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요').max(200),
  vimeo_id: z.string().min(1, 'Vimeo 영상 주소나 ID를 입력해주세요'),
  description: z.string().max(2000).optional(),
  duration_label: z.string().max(20).optional(),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_free: z.boolean(),
  published: z.boolean(),
})

// 강의 추가
export const createLessonAction = action.schema(upsertSchema).action(async ({ parsedInput }) => {
  await assertAdmin()
  const db = createServiceClient()

  const { error } = await db.from('ops_lessons').insert({
    title: parsedInput.title,
    vimeo_id: normalizeVimeoId(parsedInput.vimeo_id),
    description: parsedInput.description || null,
    duration_label: parsedInput.duration_label || null,
    sort_order: parsedInput.sort_order,
    is_free: parsedInput.is_free,
    published: parsedInput.published,
  })

  if (error) {
    console.error('[Lessons] 생성 오류:', error)
    throw new Error('[APP] 강의를 저장하지 못했어요. 다시 눌러주세요')
  }

  revalidateLessons()
  return { success: true }
})

// 강의 수정
export const updateLessonAction = action
  .schema(upsertSchema.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    const db = createServiceClient()

    const { error } = await db
      .from('ops_lessons')
      .update({
        title: parsedInput.title,
        vimeo_id: normalizeVimeoId(parsedInput.vimeo_id),
        description: parsedInput.description || null,
        duration_label: parsedInput.duration_label || null,
        sort_order: parsedInput.sort_order,
        is_free: parsedInput.is_free,
        published: parsedInput.published,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsedInput.id)

    if (error) {
      console.error('[Lessons] 수정 오류:', error)
      throw new Error('[APP] 강의를 수정하지 못했어요. 다시 눌러주세요')
    }

    revalidateLessons()
    return { success: true }
  })

// 강의 삭제
export const deleteLessonAction = action
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await assertAdmin()
    const db = createServiceClient()

    const { error } = await db.from('ops_lessons').delete().eq('id', parsedInput.id)

    if (error) {
      console.error('[Lessons] 삭제 오류:', error)
      throw new Error('[APP] 강의를 삭제하지 못했어요. 다시 시도해주세요')
    }

    revalidateLessons()
    return { success: true }
  })
