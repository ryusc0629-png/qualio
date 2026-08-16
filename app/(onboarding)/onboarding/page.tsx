'use client'

import { useState, useEffect } from 'react'
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

// 가입 경로 선택지 (코드는 서버 스키마와 일치해야 함)
const ACQUISITION_OPTIONS = [
  { value: 'youtube', label: '유튜브' },
  { value: 'search', label: '네이버·구글 검색' },
  { value: 'referral', label: '지인 소개' },
  { value: 'sns', label: '인스타그램·SNS' },
  { value: 'community', label: '블로그·카페' },
  { value: 'etc', label: '기타' },
]

// 적던 내용을 이 브라우저에 잠깐 저장해두는 자리.
// 뒤로가기·새로고침으로 화면을 다시 열어도 쓰던 게 남아 있고, 고쳐 쓸 수 있다.
// (업체 등록이 끝나면 지운다)
const DRAFT_KEY = 'qualio-onboarding-draft'

export default function OnboardingPage() {
  const [source, setSource] = useState<string | null>(null)
  const [detail, setDetail] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
  })

  // 적다 만 내용 되살리기 — 브라우저에만 있는 값이라 화면이 뜬 뒤에 채운다
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as { name?: string; phone?: string; source?: string; detail?: string }
      reset({ name: draft.name ?? '', phone: draft.phone ?? '' })
      if (draft.source) setSource(draft.source)
      if (draft.detail) setDetail(draft.detail)
    } catch {
      // 임시 저장이 깨져도 새로 적을 수 있어야 하므로 무시한다
    }
  }, [reset])

  // 적는 대로 임시 저장
  const draftName = watch('name')
  const draftPhone = watch('phone')
  useEffect(() => {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ name: draftName, phone: draftPhone, source, detail }),
      )
    } catch {
      // 저장 공간이 막혀 있어도 입력 자체는 계속돼야 한다
    }
  }, [draftName, draftPhone, source, detail])

  const { execute, isPending } = useAction(createBusinessAction, {
    onSuccess: () => {
      toast.success('업체가 등록되었습니다!')
      try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* 지우기 실패는 무시 */ }
      // 베타 기간(NEXT_PUBLIC_BETA_OPEN=true)엔 결제 없이 바로 대시보드로,
      // 그 외엔 결제 페이지로 이동(유료 플랜 선택 필수)
      window.location.replace(
        process.env.NEXT_PUBLIC_BETA_OPEN === 'true' ? '/dashboard' : '/upgrade',
      )
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '업체 등록에 실패했습니다')
    },
  })

  const onSubmit = (data: OnboardingInput) => {
    if (!source) {
      toast.error('어떻게 알게 되셨는지 선택해주세요')
      return
    }

    // 유입 출처 자동 수집 (best-effort — 링크 태깅/직접 유입 시에만 채워짐)
    const params = new URLSearchParams(window.location.search)
    const utmEntries = Array.from(params.entries()).filter(([k]) => k.startsWith('utm_'))
    const acquisitionUtm = utmEntries.length
      ? utmEntries.map(([k, v]) => `${k}=${v}`).join('&')
      : undefined
    const acquisitionReferrer = document.referrer || undefined

    execute({
      ...data,
      acquisitionSource: source,
      acquisitionDetail: source === 'etc' ? detail.trim() || undefined : undefined,
      acquisitionReferrer,
      acquisitionUtm,
    })
  }

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
            <Label htmlFor="name">업체명 (필수)</Label>
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
            <Label htmlFor="phone">전화번호 (필수)</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
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

          {/* 가입 경로 (필수) */}
          <div className="space-y-2">
            <Label>퀄리오를 어떻게 알게 되셨나요? (필수)</Label>
            <div className="grid grid-cols-2 gap-2">
              {ACQUISITION_OPTIONS.map((opt) => {
                const selected = source === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSource(opt.value)}
                    className={`h-12 rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {/* 기타 선택 시 직접 입력 */}
            {source === 'etc' && (
              <Input
                type="text"
                placeholder="어떻게 알게 되셨는지 알려주세요 (선택)"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={100}
              />
            )}
          </div>

          {/* 등록 버튼 */}
          <Button type="submit" className="w-full h-12" disabled={isPending}>
            {isPending ? '등록 중...' : '다음 — 플랜 선택하기'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
