'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { loginAction } from '@/lib/actions/auth'
import { handledAsDeploymentSkew } from '@/components/ui/deployment-skew-recovery'

// 로그인 화면에서는 '몇 자 이상' 같은 가입 규칙을 검사하지 않는다.
// 여기서 필요한 건 빈칸인지 아닌지뿐이고, 맞고 틀리고는 서버가 판단한다.
// (가입 기준이 6자→8자로 바뀐 적이 있어 옛 비밀번호를 쓰는 계정이 로그인조차 못 하게 될 수 있음)
const loginSchema = z.object({
  email: z.string().min(1, '이메일을 입력해주세요').email('이메일 주소를 다시 확인해주세요 (예: hong@naver.com)'),
  password: z.string().min(1, '비밀번호를 입력해주세요'),
})

type LoginInput = z.infer<typeof loginSchema>

function LoginForm() {
  // 로그인 후 복귀할 원래 목적지 (알림 클릭 등으로 진입 시 proxy가 붙여줌)
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? undefined

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const { execute, isPending } = useAction(loginAction, {
    onSuccess: ({ data }) => {
      if (data?.redirectTo) window.location.replace(data.redirectTo)
    },
    onError: ({ error }) => {
      // 서버가 이유를 안 준 실패 = 배포가 바뀌어 서버 동작을 못 찾은 것.
      // 비밀번호 문제로 오해하지 않도록 여기서 걸러 자동으로 새로 불러온다.
      if (handledAsDeploymentSkew(error)) return
      toast.error(error.serverError ?? '로그인에 실패했습니다')
    },
  })

  const onSubmit = (data: LoginInput) => execute({ ...data, next })

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">퀄리오 로그인</CardTitle>
        <CardDescription>업체 관리를 시작하세요</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 이메일 */}
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              placeholder="example@email.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* 비밀번호 */}
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              placeholder="비밀번호 입력"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          {/* 로그인 버튼 */}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? '로그인 중...' : '로그인'}
          </Button>

          {/* 회원가입 링크 */}
          <p className="text-center text-sm text-muted-foreground">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="text-primary font-medium hover:underline">
              무료로 시작하기
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  // useSearchParams는 Suspense 경계가 필요 — 로그인 폼을 감싼다
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">퀄리오 로그인</CardTitle>
            <CardDescription>업체 관리를 시작하세요</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
