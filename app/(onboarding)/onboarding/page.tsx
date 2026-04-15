'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createBusinessAction } from '@/lib/actions/onboarding'

const onboardingSchema = z.object({
  name: z.string().min(2, '업체명은 2자 이상이어야 합니다'),
  phone: z.string().min(1, '전화번호를 입력해주세요'),
})

type OnboardingInput = z.infer<typeof onboardingSchema>

export default function OnboardingPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
  })

  const { execute, isPending } = useAction(createBusinessAction, {
    onSuccess: () => {
      toast.success('업체가 등록되었습니다!')
      // 결제 페이지로 이동 (유료 플랜 선택 필수)
      window.location.replace('/upgrade')
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '업체 등록에 실패했습니다')
    },
  })

  const onSubmit = (data: OnboardingInput) => execute(data)

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">업체 정보 등록</CardTitle>
        <CardDescription>
          퀄리오를 시작하려면 업체 정보를 입력해주세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* 업체명 */}
          <div className="space-y-2">
            <Label htmlFor="name">업체명 *</Label>
            <Input
              id="name"
              type="text"
              placeholder="홍길동 청소"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* 전화번호 (필수) */}
          <div className="space-y-2">
            <Label htmlFor="phone">전화번호 *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="010-1234-5678 또는 01012345678"
              {...register('phone')}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              하이픈(-) 있어도 없어도 됩니다
            </p>
          </div>

          {/* 등록 버튼 */}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? '등록 중...' : '다음 — 플랜 선택하기'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
