'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

// 새 버전이 배포되면 열어둔 화면이 못 쓰게 되는 문제를 자동으로 복구한다.
//
// 무슨 일이 일어나나:
// 사장님이 화면을 열어둔 채로 우리가 새 버전을 올리면, 브라우저에 남아 있는 옛 화면은
// 이미 사라진 '서버 동작 ID'를 부른다. 그러면 서버가 404를 주고
// (Failed to find Server Action ...), 화면에는 "로그인에 실패했습니다" 같은
// 엉뚱한 메시지만 뜬다. 사장님은 비밀번호를 잘못 넣은 줄 알고 계속 다시 시도한다.
// 2026-08-18 실제로 대표 계정 로그인에서 4번 연속 이렇게 실패했다.
//
// 어떻게 고치나:
// 이 오류를 알아채면 "새 버전이 올라왔어요"라고 알려주고 화면을 새로 불러온다.
// 새로고침 한 번이면 정상으로 돌아간다.
//
// ⚠️ 무한 새로고침 방지: 한 번 새로고침한 뒤에는 같은 탭에서 다시 하지 않는다.
//    (새로고침해도 계속 같은 오류가 나는 상황이면 자동 복구로는 못 고치는 문제다)

const RELOADED_KEY = 'qualio:skew-reloaded'

/** 배포가 바뀌어 서버 동작을 못 찾는 오류인지 */
function isSkewError(message: string): boolean {
  return (
    message.includes('Failed to find Server Action') ||
    message.includes('older or newer deployment')
  )
}

function recover() {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return
    sessionStorage.setItem(RELOADED_KEY, '1')
  } catch {
    // 시크릿 모드 등에서 sessionStorage가 막혀 있으면 그냥 진행한다
  }
  toast.info('새 버전이 올라왔어요. 화면을 새로 불러올게요')
  setTimeout(() => window.location.reload(), 1200)
}

export function DeploymentSkewRecovery() {
  useEffect(() => {
    // 정상 진입(=오류 없이 화면이 떴다)이면 이전 기록을 지워 다음 배포 때 다시 동작하게 한다
    try {
      sessionStorage.removeItem(RELOADED_KEY)
    } catch {
      /* 무시 */
    }

    const onError = (e: ErrorEvent) => {
      if (isSkewError(e.message ?? '')) recover()
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const message = reason instanceof Error ? reason.message : String(reason ?? '')
      if (isSkewError(message)) recover()
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}

/**
 * 서버 액션이 실패했는데 서버가 알려준 이유가 없는 경우 = 배포가 바뀐 것.
 * next-safe-action은 이때 serverError를 채우지 못한다(요청 자체가 404라서).
 *
 * 배포 문제로 판단되면 자동 복구를 걸고 true를 돌려준다.
 * 호출부는 true면 자기 오류 메시지를 띄우지 않는다.
 */
export function handledAsDeploymentSkew(error: {
  serverError?: string
  validationErrors?: unknown
}): boolean {
  if (error.serverError || error.validationErrors) return false
  recover()
  return true
}
