'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2 } from 'lucide-react'
import { submitAcademyInquiryAction } from '@/lib/actions/academy-inquiry'

type FormValues = {
  academy_name: string
  contact_name: string
  phone: string
  region: string
  message: string
}

type ProgramType = 'cleaning' | 'other_tech' | 'preparing'
type StudentScale = 'small' | 'medium' | 'large'

const PROGRAM_OPTIONS: { value: ProgramType; label: string }[] = [
  { value: 'cleaning', label: '청소·방역 관련' },
  { value: 'other_tech', label: '기타 기술 과정' },
  { value: 'preparing', label: '신설 준비 중' },
]

const SCALE_OPTIONS: { value: StudentScale; label: string }[] = [
  { value: 'small', label: '1~10명' },
  { value: 'medium', label: '11~30명' },
  { value: 'large', label: '30명 이상' },
]

export function AcademyInquiryForm() {
  const [programType, setProgramType] = useState<ProgramType | ''>('')
  const [studentScale, setStudentScale] = useState<StudentScale | ''>('')
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { academy_name: '', contact_name: '', phone: '', region: '', message: '' },
  })

  const { execute, isPending } = useAction(submitAcademyInquiryAction, {
    onSuccess: () => setDone(true),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 접수 완료 화면
  if (done) {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <p className="font-bold text-lg">제휴 문의가 접수됐어요!</p>
        <p className="text-sm text-muted-foreground break-keep">
          담당자가 영업일 기준 1~2일 안에 연락드려, 커리큘럼 구성과 제휴 조건을
          자세히 안내해 드릴게요.
        </p>
      </div>
    )
  }

  const onSubmit = (values: FormValues) => {
    if (!programType) {
      toast.error('운영 중인 과정을 선택해주세요')
      return
    }
    if (!studentScale) {
      toast.error('수강생 규모를 선택해주세요')
      return
    }
    execute({ ...values, program_type: programType, student_scale: studentScale })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* 학원명 */}
      <div className="space-y-1.5">
        <label htmlFor="academy_name" className="text-sm font-medium">
          학원명 (필수)
        </label>
        <Input
          id="academy_name"
          placeholder="예: OO직업전문학교 / OO기술학원"
          className="h-12"
          {...register('academy_name', { required: '학원명을 입력해주세요' })}
        />
        {errors.academy_name && (
          <p className="text-sm text-red-500">{errors.academy_name.message}</p>
        )}
      </div>

      {/* 담당자명 */}
      <div className="space-y-1.5">
        <label htmlFor="contact_name" className="text-sm font-medium">
          원장 / 담당자명 (필수)
        </label>
        <Input
          id="contact_name"
          placeholder="예: 김원장"
          className="h-12"
          {...register('contact_name', { required: '담당자명을 입력해주세요' })}
        />
        {errors.contact_name && (
          <p className="text-sm text-red-500">{errors.contact_name.message}</p>
        )}
      </div>

      {/* 연락처 */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className="text-sm font-medium">
          연락받을 전화번호 (필수)
        </label>
        <Input
          id="phone"
          inputMode="tel"
          placeholder="010-1234-5678"
          className="h-12"
          {...register('phone', { required: '전화번호를 입력해주세요' })}
        />
        {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
      </div>

      {/* 지역 */}
      <div className="space-y-1.5">
        <label htmlFor="region" className="text-sm font-medium">
          지역 (선택)
        </label>
        <Input
          id="region"
          placeholder="예: 울산 남구 / 부산"
          className="h-12"
          {...register('region')}
        />
      </div>

      {/* 운영 중인 과정 — 카드형 선택 (자격 검증) */}
      <div className="space-y-2">
        <p className="text-sm font-medium">운영 중인 과정 (필수)</p>
        <div className="grid grid-cols-3 gap-2">
          {PROGRAM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setProgramType(opt.value)}
              className={`h-16 rounded-xl border-2 flex items-center justify-center px-2 text-center text-sm font-medium leading-tight transition ${
                programType === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기수당 수강생 규모 — 카드형 선택 (자격 검증) */}
      <div className="space-y-2">
        <p className="text-sm font-medium">기수당 수강생 규모 (필수)</p>
        <div className="grid grid-cols-3 gap-2">
          {SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStudentScale(opt.value)}
              className={`h-12 rounded-xl border-2 flex items-center justify-center text-sm font-medium transition ${
                studentScale === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 문의 내용 */}
      <div className="space-y-1.5">
        <label htmlFor="message" className="text-sm font-medium">
          문의 내용 (선택)
        </label>
        <Textarea
          id="message"
          placeholder="궁금한 점이나 학원 상황을 자유롭게 적어주세요"
          className="min-h-24"
          {...register('message')}
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full h-12 text-base font-bold">
        {isPending ? '접수 중...' : '제휴 문의 남기기'}
      </Button>
      <p className="text-xs text-center text-muted-foreground break-keep">
        담당자가 직접 연락드려 안내해요. 광고 문자는 보내지 않아요.
      </p>
    </form>
  )
}
