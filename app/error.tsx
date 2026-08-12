'use client' // 에러 바운더리는 반드시 클라이언트 컴포넌트

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { isNetworkError } from '@/lib/utils/is-network-error'

// 라우트에서 예기치 못한 오류가 났을 때 하얀 화면 대신 보여주는 안내 화면
// 오류는 자동으로 Sentry에 전송되어 본사가 확인한다.
// 단, 인터넷이 끊겨서 난 오류는 고칠 게 없으므로 접수하지 않고 안내 문구만 바꾼다.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const offline = isNetworkError(error)

  useEffect(() => {
    // 개발자용 로그 + Sentry 자동 수집(네트워크 끊김은 제외 — 진짜 버그가 묻히지 않도록)
    console.error(error)
    if (!offline) Sentry.captureException(error)
  }, [error, offline])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl">{offline ? '📡' : '😵'}</p>
      <h2 className="mt-4 text-lg font-bold">
        {offline ? '인터넷 연결이 끊겼어요' : '잠깐 문제가 생겼어요'}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {offline
          ? '와이파이나 데이터가 잘 연결됐는지 확인하고, 아래 버튼을 눌러주세요. 입력하시던 내용은 그대로 있어요.'
          : '방금 화면을 보여드리다가 오류가 났어요. 자동으로 저희에게 접수됐으니 곧 고쳐드릴게요. 아래 버튼을 눌러 다시 시도해보세요.'}
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => reset()}>다시 시도하기</Button>
        <Button variant="outline" onClick={() => window.location.replace('/dashboard')}>
          홈으로 가기
        </Button>
      </div>
    </div>
  )
}
