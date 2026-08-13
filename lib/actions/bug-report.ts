'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { sendPushToBusiness } from '@/lib/push/web-push'
import { getAdminBusinessIds } from '@/lib/admin/auth'

// 로그인 사용자의 업체명·이름 등 신고 맥락을 조회 (비로그인이어도 신고는 접수)
async function getReporterContext(db: SupabaseClient) {
  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return { businessId: null, userId: null, reporterName: null }

  const { data: profile } = await db
    .from('profiles')
    .select('business_id, full_name, businesses!business_id(name)')
    .eq('id', user.id)
    .maybeSingle()

  const p = profile as
    | { business_id?: string | null; full_name?: string | null; businesses?: { name?: string | null } | null }
    | null
  const businessName = p?.businesses?.name ?? null
  const reporterName = businessName ?? p?.full_name ?? null
  return {
    businessId: p?.business_id ?? null,
    userId: user.id,
    reporterName,
  }
}

const bugReportSchema = z.object({
  message: z.string().min(1, '어떤 문제가 있었는지 알려주세요').max(2000),
  // 신고 당시 화면 경로 — 클라이언트가 window.location.pathname 등을 담아 보냄
  pageUrl: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  // 화면 크기 — 폰인지 PC인지, 좁은 화면에서만 나는 문제인지 구분용
  viewport: z.string().max(50).optional(),
  // 첨부 이미지·영상 공개 URL (브라우저에서 스토리지로 직접 업로드한 뒤 URL만 전달)
  mediaUrls: z.array(z.string().url()).max(5).optional(),
})

export const submitBugReportAction = action
  .schema(bugReportSchema)
  .action(async ({ parsedInput }) => {
    // bug_reports는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
    const db = createServiceClient() as unknown as SupabaseClient
    const { businessId, userId, reporterName } = await getReporterContext(db)

    const { error } = await db.from('bug_reports').insert({
      business_id: businessId,
      user_id: userId,
      reporter_name: reporterName,
      message: parsedInput.message.trim(),
      page_url: parsedInput.pageUrl ?? null,
      user_agent: parsedInput.userAgent ?? null,
      viewport: parsedInput.viewport ?? null,
      // 어느 배포에서 난 오류인지 — 고친 뒤에 들어온 신고인지 바로 구분된다
      app_version: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
      media_urls: parsedInput.mediaUrls && parsedInput.mediaUrls.length > 0 ? parsedInput.mediaUrls : null,
    })

    if (error) {
      console.error('[BugReport] insert 실패:', error)
      throw new Error('[APP] 신고를 접수하지 못했어요. 다시 눌러주세요')
    }

    // 본사(관리자) 폰에 즉시 알림 — 실패해도 접수는 유지
    try {
      const label = reporterName ? `${reporterName}님` : '한 사장님'
      const preview = parsedInput.message.trim().slice(0, 40)
      const adminBusinessIds = await getAdminBusinessIds()
      await Promise.all(
        adminBusinessIds.map((adminBusinessId) =>
          sendPushToBusiness(adminBusinessId, {
            title: '🐞 오류 신고가 들어왔어요',
            body: `${label} · ${preview}`,
            url: '/admin/bug-reports',
            tag: 'bug-report',
          }),
        ),
      )
    } catch (e) {
      console.error('[BugReport] 관리자 알림 실패:', e)
    }

    return { success: true }
  })
