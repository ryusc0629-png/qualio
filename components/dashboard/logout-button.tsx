'use client'

import { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/lib/actions/auth'

export function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction()
      // 세션 삭제 후 완전 새로고침으로 이동 — 서버 컴포넌트 캐시까지 비워 확실히 로그아웃 상태로 진입
      window.location.replace('/login')
    })
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout} disabled={isPending}>
      <LogOut className="h-4 w-4 mr-1.5" />
      {isPending ? '로그아웃 중...' : '로그아웃'}
    </Button>
  )
}
