'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSafeActionClient } from 'next-safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { getAdminBusinessIds } from '@/lib/admin/auth'

// 운영 과정/규모 라벨(알림·표시용) — 자격 검증 항목
const PROGRAM_LABEL: Record<string, string> = {
  cleaning: '청소·방역 관련 과정',
  other_tech: '기타 기술 과정',
  preparing: '신설 준비 중',
}
const SCALE_LABEL: Record<string, string> = {
  small: '기수당 1~10명',
  medium: '기수당 11~30명',
  large: '기수당 30명 이상',
}

// 공개 폼용 액션 클라이언트 (인증 불필요) — 학원 제휴 문의 전용
const publicAction = createSafeActionClient({
  handleServerError(e) {
    if (e.message.startsWith('[APP]')) return e.message.replace('[APP] ', '')
    console.error('[AcademyInquiry Error]', e)
    return '요청 처리 중 오류가 발생했습니다'
  },
})

// 한국 휴대폰 번호 검증(숫자만)
const phoneRegex = /^01[016789]\d{7,8}$/

const academyInquirySchema = z.object({
  academy_name: z.string().min(1, '학원명을 입력해주세요').max(80),
  contact_name: z.string().min(1, '담당자명을 입력해주세요').max(50),
  // 하이픈/공백 제거 후 검증
  phone: z
    .string()
    .transform((v) => v.replace(/[^0-9]/g, ''))
    .refine((v) => phoneRegex.test(v), {
      message: '전화번호는 숫자만 입력해주세요 (예: 01012345678)',
    }),
  region: z.string().max(60).optional().default(''),
  // 운영 과정: cleaning | other_tech | preparing
  program_type: z
    .string()
    .refine((v) => ['cleaning', 'other_tech', 'preparing'].includes(v), {
      message: '운영 중인 과정을 선택해주세요',
    }),
  // 기수당 수강생 규모: small | medium | large
  student_scale: z
    .string()
    .refine((v) => ['small', 'medium', 'large'].includes(v), {
      message: '수강생 규모를 선택해주세요',
    }),
  message: z.string().max(1000).optional().default(''),
})

export const submitAcademyInquiryAction = publicAction
  .schema(academyInquirySchema)
  .action(async ({ parsedInput }) => {
    // academy_inquiries는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
    const looseDb = createServiceClient() as unknown as SupabaseClient
    const academyName = parsedInput.academy_name.trim()
    const contactName = parsedInput.contact_name.trim()
    const phone = parsedInput.phone
    const region = parsedInput.region.trim() || null
    const message = parsedInput.message.trim() || null

    // 같은 번호가 이미 문의했으면 갱신(중복 방지), 없으면 신규
    const { data: existing } = (await looseDb
      .from('academy_inquiries')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()) as unknown as { data: { id: string } | null }

    if (existing) {
      await looseDb
        .from('academy_inquiries')
        .update({
          academy_name: academyName,
          contact_name: contactName,
          region,
          program_type: parsedInput.program_type,
          student_scale: parsedInput.student_scale,
          message,
        })
        .eq('id', existing.id)
    } else {
      const { error } = await looseDb.from('academy_inquiries').insert({
        academy_name: academyName,
        contact_name: contactName,
        phone,
        region,
        program_type: parsedInput.program_type,
        student_scale: parsedInput.student_scale,
        message,
      })
      if (error) {
        console.error('[AcademyInquiry] insert 실패:', error)
        throw new Error('[APP] 문의 접수에 실패했어요. 다시 눌러주세요')
      }

      // 신규 문의만 대표(본사) 폰에 푸시 — 실패해도 접수는 유지
      try {
        const programLabel = PROGRAM_LABEL[parsedInput.program_type] ?? ''
        const scaleLabel = SCALE_LABEL[parsedInput.student_scale] ?? ''
        const businessIds = await getAdminBusinessIds()
        await Promise.all(
          businessIds.map((businessId) =>
            sendPushToBusiness(businessId, {
              title: '학원 제휴 문의! 🏫',
              body: `${academyName} · ${contactName} · ${programLabel} · ${scaleLabel}`,
              url: '/admin/academy-inquiries',
              tag: `academy-${phone}`,
            }),
          ),
        )
      } catch (e) {
        console.error('[AcademyInquiry] 관리자 알림 실패:', e)
      }
    }

    return { success: true }
  })
