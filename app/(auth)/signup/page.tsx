'use client'

import { useState } from 'react'
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
import { signupAction } from '@/lib/actions/auth'

const signupSchema = z.object({
  fullName: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  email: z.string().email('올바른 이메일 형식이 아닙니다'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
})

type SignupInput = z.infer<typeof signupSchema>

export default function SignupPage() {
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  })

  const { execute, isPending } = useAction(signupAction, {
    onSuccess: ({ data }) => {
      // 이메일 인증 필요 (Supabase Email Confirm 활성화 상태)
      if (data?.emailConfirmation) {
        setEmailSent(true)
        return
      }
      if (data?.redirectTo) window.location.replace(data.redirectTo)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '회원가입에 실패했습니다')
    },
  })

  const onSubmit = (data: SignupInput) => execute(data)

  // 이메일 인증 안내 화면
  if (emailSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">이메일을 확인해주세요</CardTitle>
          <CardDescription>가입 확인 이메일을 발송했습니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            이메일 받은편지함을 확인하고<br />
            링크를 클릭하면 자동으로 로그인됩니다.
          </p>
          <p className="text-xs text-muted-foreground">
            이메일이 오지 않으면 스팸함을 확인해주세요.
          </p>
          <Link href="/login" className="block text-sm text-primary font-medium hover:underline">
            로그인 페이지로 이동
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">퀄리오 시작하기</CardTitle>
        <CardDescription>청소 업체 관리를 스마트하게</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 이름 */}
          <div className="space-y-2">
            <Label htmlFor="fullName">이름</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="홍길동"
              {...register('fullName')}
            />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>

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
              placeholder="8자 이상"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          {/* 가입 버튼 */}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? '가입 중...' : '무료로 시작하기'}
          </Button>

          {/* 로그인 링크 */}
          <p className="text-center text-sm text-muted-foreground">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              로그인
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
