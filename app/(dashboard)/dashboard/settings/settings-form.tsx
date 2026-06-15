'use client'

import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateBusinessAction } from '@/lib/actions/settings'

interface Business {
  name: string
  phone: string | null
  address: string | null
  description: string | null
  naver_place_url: string | null
  google_place_url: string | null
  youtube_url: string | null
}

interface Props {
  business: Business
}

export function SettingsForm({ business }: Props) {
  const { execute, isPending } = useAction(updateBusinessAction, {
    onSuccess: () => toast.success('설정이 저장되었습니다'),
    onError: ({ error }) => toast.error(error.serverError ?? '저장에 실패했습니다'),
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)

    execute({
      name:             data.get('name') as string,
      phone:            data.get('phone') as string,
      address:          data.get('address') as string,
      description:      data.get('description') as string,
      naver_place_url:  data.get('naver_place_url') as string,
      google_place_url: data.get('google_place_url') as string,
      youtube_url:      data.get('youtube_url') as string,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 업체 기본 정보 */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">기본 정보</h2>

        <div className="space-y-2">
          <Label htmlFor="name">업체명 <span className="text-destructive">*</span></Label>
          <Input
            id="name"
            name="name"
            defaultValue={business.name}
            placeholder="예: 깔끔청소 홍길동"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">전화번호</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={business.phone ?? ''}
            placeholder="01012345678"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">주소</Label>
          <Input
            id="address"
            name="address"
            defaultValue={business.address ?? ''}
            placeholder="서울시 강남구 테헤란로 123"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">업체 소개</Label>
          <Input
            id="description"
            name="description"
            defaultValue={business.description ?? ''}
            placeholder="10년 경력의 청소 전문 업체입니다"
          />
          <p className="text-xs text-muted-foreground">고객 견적 폼 상단에 표시됩니다</p>
        </div>
      </div>

      {/* 외부 채널 연동 */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">채널 연동</h2>

        <div className="space-y-2">
          <Label htmlFor="google_place_url">구글 플레이스 후기 URL</Label>
          <Input
            id="google_place_url"
            name="google_place_url"
            defaultValue={business.google_place_url ?? ''}
            placeholder="https://g.page/r/..."
          />
          <p className="text-xs text-muted-foreground">구글 지도 업체 페이지 → 리뷰 작성 링크 (우선 사용)</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="naver_place_url">네이버 플레이스 후기 URL</Label>
          <Input
            id="naver_place_url"
            name="naver_place_url"
            defaultValue={business.naver_place_url ?? ''}
            placeholder="https://naver.me/..."
          />
          <p className="text-xs text-muted-foreground">구글 링크가 없을 때 대신 사용됩니다</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="youtube_url">유튜브 시공 영상 URL</Label>
          <Input
            id="youtube_url"
            name="youtube_url"
            defaultValue={business.youtube_url ?? ''}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          <p className="text-xs text-muted-foreground">등록 시 고객 견적서에 시공 영상이 자동 표시됩니다</p>
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? '저장 중...' : '설정 저장'}
      </Button>
    </form>
  )
}
