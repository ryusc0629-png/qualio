'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { loginAction } from '@/lib/actions/auth'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일 형식이 아닙니다'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
})

type LoginInput = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const { execute, isPending } = useAction(loginAction, {
    onSuccess: ({ data }) => {
      if (data?.redirectTo) router.push(data.redirectTo)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '로그인에 실패했습니다')
    },
  })

  const onSubmit = (data: LoginInput) => execute(data)

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
              placeholder="••••••••"
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
