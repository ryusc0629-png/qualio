'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSafeActionClient } from 'next-safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { getAdminBusinessIds } from '@/lib/admin/auth'

// 자격 구분 라벨(알림·표시용)
const OWNER_STATUS_LABEL: Record<string, string> = {
  operating: '청소업체 운영 중',
  preparing: '청소 창업 준비 중',
}

// 공개 폼용 액션 클라이언트 (인증 불필요) — 90일 챌린지 사전신청 전용
const publicAction = createSafeActionClient({
  handleServerError(e) {
    if (e.message.startsWith('[APP]')) return e.message.replace('[APP] ', '')
    console.error('[PreRegistration Error]', e)
    return '요청 처리 중 오류가 발생했습니다'
  },
})

// 한국 휴대폰 번호 검증(숫자만)
const phoneRegex = /^01[016789]\d{7,8}$/

const preRegistrationSchema = z.object({
  name: z.string().min(1, '이름 또는 상호를 입력해주세요').max(50),
  // 하이픈/공백 제거 후 검증
  phone: z
    .string()
    .transform((v) => v.replace(/[^0-9]/g, ''))
    .refine((v) => phoneRegex.test(v), {
      message: '전화번호는 숫자만 입력해주세요 (예: 01012345678)',
    }),
  // 자격 구분: operating(청소업체 운영 중) | preparing(청소 창업 준비 중)
  owner_status: z.string().refine((v) => ['operating', 'preparing'].includes(v), {
    message: '해당하는 항목을 선택해주세요',
  }),
})

export const submitPreRegistrationAction = publicAction
  .schema(preRegistrationSchema)
  .action(async ({ parsedInput }) => {
    // pre_registrations는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
    const looseDb = createServiceClient() as unknown as SupabaseClient
    const name = parsedInput.name.trim()
    const phone = parsedInput.phone

    // 같은 번호가 이미 신청했으면 갱신(중복 방지), 없으면 신규
    const { data: existing } = await looseDb
      .from('pre_registrations')
      .select('id')
      .eq('phone', phone)
      .maybeSingle() as unknown as { data: { id: string } | null }

    if (existing) {
      await looseDb
        .from('pre_registrations')
        .update({ name, owner_status: parsedInput.owner_status })
        .eq('id', existing.id)
    } else {
      const { error } = await looseDb.from('pre_registrations').insert({
        name,
        phone,
        owner_status: parsedInput.owner_status,
      })
      if (error) {
        console.error('[PreRegistration] insert 실패:', error)
        throw new Error('[APP] 신청 접수에 실패했어요. 다시 눌러주세요')
      }

      // 신규 신청만 대표(본사) 폰에 푸시 — 실패해도 접수는 유지
      try {
        const statusLabel = OWNER_STATUS_LABEL[parsedInput.owner_status] ?? ''
        const businessIds = await getAdminBusinessIds()
        await Promise.all(
          businessIds.map((businessId) =>
            sendPushToBusiness(businessId, {
              title: '90일 챌린지 사전신청! 🎉',
              body: `${name}님 · ${statusLabel} · ${phone}`,
              url: '/admin/pre-registrations',
              tag: `pre-reg-${phone}`,
            }),
          ),
        )
      } catch (e) {
        console.error('[PreRegistration] 관리자 알림 실패:', e)
      }
    }

    return { success: true }
  })
