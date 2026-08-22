'use server'

import { z } from 'zod'
import { createSafeActionClient } from 'next-safe-action'
import { createServiceClient } from '@/lib/supabase/server'
import { assertAdmin } from '@/lib/admin/auth'

const adminAction = createSafeActionClient({
  handleServerError(e) {
    if (e.message.startsWith('[APP]')) return e.message.replace('[APP] ', '')
    console.error('[AdminAccount Error]', e)
    return '요청 처리 중 오류가 발생했습니다'
  },
})

// 전화로 불러줄 임시 비밀번호를 만든다.
// ⚠️헷갈리는 글자(0·o·O·1·l·i)는 뺀다 — 전화로 부르다 틀리면 사장님이 두 번 걸어야 한다.
const LETTERS = 'abcdefghjkmnpqrstuvwxyz' // l·i·o 제외
const DIGITS = '23456789'                 // 0·1 제외

function makeTempPassword(): string {
  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  // 예: 'qualio-krms-4837' 꼴 — 읽어주기 쉽고 추측은 어렵다
  return `qualio-${pick(LETTERS, 4)}-${pick(DIGITS, 4)}`
}

/**
 * 고객사 대표 계정의 비밀번호를 임시 비밀번호로 초기화한다.
 *
 * 왜 '알려주기'가 아니라 '초기화'인가: 비밀번호는 bcrypt 해시로만 저장돼 원문을 꺼낼 방법이
 * 없다(있으면 그게 사고다). 그래서 잊었을 때 할 수 있는 일은 새로 정해주는 것뿐이다.
 *
 * 왜 메일이 아니라 화면 표시인가: 우리 고객사는 이메일을 잘 안 열고, 이 프로젝트는 메일 발송을
 * 쓴 적이 없다(auth.users 32명 전원 confirmation_sent_at이 비어 있음 = 메일 경로 미검증).
 * 전화로 불러주는 게 실제로 통하는 유일한 경로다.
 */
export const resetBusinessPasswordAction = adminAction
  .schema(z.object({ businessId: z.string().uuid() }))
  .action(async ({ parsedInput: { businessId } }) => {
    const admin = await assertAdmin()
    const db = createServiceClient()

    const { data: business } = await db
      .from('businesses')
      .select('id, name, owner_id')
      .eq('id', businessId)
      .maybeSingle()

    if (!business?.owner_id) throw new Error('[APP] 이 업체의 대표 계정을 찾지 못했어요')

    const tempPassword = makeTempPassword()
    // must_change_password: 임시 비밀번호로 로그인하면 대시보드 대신 '새 비밀번호 정하기'가 먼저 뜬다.
    // ★app_metadata에 둔다 — user_metadata는 사용자가 스스로 지울 수 있어 안내가 사라진다.
    const { data: updated, error } = await db.auth.admin.updateUserById(business.owner_id, {
      password: tempPassword,
      app_metadata: { must_change_password: true },
    })

    if (error || !updated?.user) {
      console.error('[AdminAccount] 비밀번호 초기화 실패:', error)
      throw new Error('[APP] 초기화하지 못했어요. 잠시 후 다시 눌러주세요')
    }

    // 누가 누구 계정을 언제 열어줬는지는 남겨야 한다 — 계정에 손대는 일이라 흔적이 없으면 안 된다
    console.error(
      `[AdminAccount] 비밀번호 초기화: business=${business.name}(${businessId}) by=${admin.email}`
    )

    return {
      success: true,
      email: updated.user.email ?? null,
      businessName: business.name,
      tempPassword,
    }
  })
