'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Quote } from 'lucide-react'
import { updateBusinessAction } from '@/lib/actions/settings'
import { BrandDesignSection } from './brand-design-section'
import { ServiceAreaPicker } from './service-area-picker'
import { BaseAddressPicker } from './base-address-picker'
import { normalizeHex, type HeroStyle } from '@/lib/brand'
import { buildAreaServed, parseKoreanRegion } from '@/lib/address/parse-region'

interface Testimonial {
  quote: string
  author: string
}

type RewardType = 'none' | 'discount_amount' | 'discount_rate' | 'gifticon'

// DB에 저장된 타입 → UI 상위 타입으로 변환
function toRewardCategory(type: string): 'none' | 'discount' | 'gifticon' {
  if (type === 'discount_amount' || type === 'discount_rate') return 'discount'
  if (type === 'gifticon') return 'gifticon'
  return 'none'
}

const REVIEW_PLATFORMS = [
  { key: 'naver',    label: '네이버 플레이스', urlField: 'naver_place_url' },
  { key: 'google',   label: '구글 플레이스',   urlField: 'google_place_url' },
  { key: 'danggeun', label: '당근마켓',        urlField: 'danggeun_review_url' },
  { key: 'kakao',    label: '카카오맵',        urlField: 'kakao_place_url' },
] as const

type ReviewPlatform = typeof REVIEW_PLATFORMS[number]['key']

interface Business {
  id: string
  name: string
  phone: string | null
  address: string | null
  description: string | null
  naver_place_url: string | null
  google_place_url: string | null
  danggeun_review_url: string | null
  kakao_place_url: string | null
  active_review_platform: string
  youtube_url: string | null
  instagram_url: string | null
  service_areas: string[] | null
  review_reward_type: string
  review_reward_description: string | null
  logo_url: string | null
  hero_image_url: string | null
  brand_color: string | null
  brand_color_secondary: string | null
  hero_style: string | null
  slug: string | null
  hero_title: string | null
  hero_subtitle: string | null
  testimonials: Testimonial[] | null
}

interface Props {
  business: Business
}

export function SettingsForm({ business }: Props) {
  // 할인 세부 타입 (discount_amount | discount_rate) 초기값
  const initialType = business.review_reward_type as RewardType
  const [activePlatform, setActivePlatform] = useState<ReviewPlatform>(
    (REVIEW_PLATFORMS.some(p => p.key === business.active_review_platform)
      ? business.active_review_platform
      : 'naver') as ReviewPlatform
  )
  const [rewardCategory, setRewardCategory] = useState<'none' | 'discount' | 'gifticon'>(
    toRewardCategory(initialType)
  )
  const [discountType, setDiscountType] = useState<'discount_amount' | 'discount_rate'>(
    initialType === 'discount_rate' ? 'discount_rate' : 'discount_amount'
  )
  const [rewardValue, setRewardValue] = useState(business.review_reward_description ?? '')

  // 웹사이트 디자인 상태
  const [brandColor, setBrandColor] = useState(business.brand_color ?? '')
  const [brandSecondary, setBrandSecondary] = useState(business.brand_color_secondary ?? '')
  const [heroStyle, setHeroStyle] = useState<HeroStyle>(
    business.hero_style === 'light' ? 'light' : 'dark',
  )
  const [logoUrl, setLogoUrl] = useState(business.logo_url ?? '')
  const [heroImageUrl, setHeroImageUrl] = useState(business.hero_image_url ?? '')
  const [heroTitle, setHeroTitle] = useState(business.hero_title ?? '')
  const [heroSubtitle, setHeroSubtitle] = useState(business.hero_subtitle ?? '')
  const [testimonials, setTestimonials] = useState<Testimonial[]>(
    business.testimonials ?? []
  )

  // 업체 주소 — 시/도·시군구 선택 기반 (상태로 들고 자동 지역 즉시 반영)
  const [address, setAddress] = useState(business.address ?? '')
  // 출장 지역 — 주소 기준 자동 노출 지역 + 사장님이 선택하는 추가 지역
  const autoAreas = buildAreaServed(address, [])
  const [serviceAreas, setServiceAreas] = useState<string[]>(business.service_areas ?? [])

  const { execute, isPending } = useAction(updateBusinessAction, {
    onSuccess: () => toast.success('설정이 저장됐어요!'),
    onError: ({ error }) => toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요'),
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)

    // 보상 타입 결정
    let rewardType: string = 'none'
    if (rewardCategory === 'discount') rewardType = discountType
    else if (rewardCategory === 'gifticon') rewardType = 'gifticon'

    execute({
      name:                      data.get('name') as string,
      phone:                     data.get('phone') as string,
      address:                   address,
      description:               data.get('description') as string,
      naver_place_url:           data.get('naver_place_url') as string,
      google_place_url:          data.get('google_place_url') as string,
      danggeun_review_url:       data.get('danggeun_review_url') as string,
      kakao_place_url:           data.get('kakao_place_url') as string,
      active_review_platform:    activePlatform,
      youtube_url:               data.get('youtube_url') as string,
      instagram_url:             data.get('instagram_url') as string,
      service_areas:             serviceAreas.join(','),
      review_reward_type:        rewardType,
      review_reward_description: rewardCategory === 'none' ? '' : rewardValue,
      brand_color:               normalizeHex(brandColor) ?? '',
      brand_color_secondary:     normalizeHex(brandSecondary) ?? '',
      hero_style:                heroStyle,
      logo_url:                  logoUrl.trim(),
      hero_image_url:            heroImageUrl.trim(),
      hero_title:                heroTitle.trim(),
      hero_subtitle:             heroSubtitle.trim(),
      testimonials:              JSON.stringify(
        testimonials.filter((t) => t.quote.trim())
      ),
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
          <Label>주소</Label>
          <BaseAddressPicker value={address} onChange={setAddress} />
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

      {/* 출장 지역 (검색 노출) */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">출장 지역</h2>
          <p className="text-xs text-muted-foreground mt-1">
            위 주소를 기준으로 검색에 노출될 지역이 자동 설정돼요. 더 멀리까지 출장 가시면 지역을 추가하세요.
          </p>
        </div>

        {/* 주소 기준 자동 설정 지역 */}
        {autoAreas.length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">자동 설정된 지역 (주소 기준)</Label>
            <div className="flex flex-wrap gap-1.5">
              {autoAreas.map((a) => (
                <span key={a} className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {a}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">위에 주소를 입력하고 저장하면 지역이 자동으로 잡혀요.</p>
        )}

        {/* 더 출장 가는 지역 — 시/도 → 시군구 선택 */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">더 출장 가는 지역 (선택)</Label>
          <ServiceAreaPicker
            value={serviceAreas}
            onChange={setServiceAreas}
            homeSido={parseKoreanRegion(address).sido}
          />
        </div>
      </div>

      {/* 웹사이트 디자인 (브랜드 커스터마이징) */}
      <BrandDesignSection
        businessId={business.id}
        businessName={business.name}
        slug={business.slug}
        brandColor={brandColor}
        brandSecondary={brandSecondary}
        heroStyle={heroStyle}
        logoUrl={logoUrl}
        heroImageUrl={heroImageUrl}
        heroTitle={heroTitle}
        heroSubtitle={heroSubtitle}
        onChange={(next) => {
          if (next.brandColor !== undefined) setBrandColor(next.brandColor)
          if (next.brandSecondary !== undefined) setBrandSecondary(next.brandSecondary)
          if (next.heroStyle !== undefined) setHeroStyle(next.heroStyle)
          if (next.logoUrl !== undefined) setLogoUrl(next.logoUrl)
          if (next.heroImageUrl !== undefined) setHeroImageUrl(next.heroImageUrl)
          if (next.heroTitle !== undefined) setHeroTitle(next.heroTitle)
          if (next.heroSubtitle !== undefined) setHeroSubtitle(next.heroSubtitle)
        }}
      />

      {/* 리뷰 수집 채널 */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">리뷰 수집 채널</h2>
          <p className="text-xs text-muted-foreground mt-1">
            리뷰 요청 알림톡에 연결할 채널을 선택하세요. 한 채널에 리뷰가 모이면 다른 채널로 전환할 수 있어요.
          </p>
        </div>

        {/* 활성 채널 선택 */}
        <div className="space-y-2">
          <Label>현재 리뷰 수집 중인 채널</Label>
          <div className="grid grid-cols-2 gap-2">
            {REVIEW_PLATFORMS.map((platform) => (
              <button
                key={platform.key}
                type="button"
                onClick={() => setActivePlatform(platform.key)}
                className={`h-11 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                  activePlatform === platform.key
                    ? 'border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary/30'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {platform.label}
              </button>
            ))}
          </div>
        </div>

        {/* 채널별 URL 입력 */}
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-2">
            <Label htmlFor="naver_place_url">
              네이버 플레이스 후기 URL
              {activePlatform === 'naver' && <span className="text-primary ml-1.5 text-xs font-semibold">(수집 중)</span>}
            </Label>
            <Input
              id="naver_place_url"
              name="naver_place_url"
              defaultValue={business.naver_place_url ?? ''}
              placeholder="https://naver.me/..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="google_place_url">
              구글 플레이스 후기 URL
              {activePlatform === 'google' && <span className="text-primary ml-1.5 text-xs font-semibold">(수집 중)</span>}
            </Label>
            <Input
              id="google_place_url"
              name="google_place_url"
              defaultValue={business.google_place_url ?? ''}
              placeholder="https://g.page/r/..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="danggeun_review_url">
              당근마켓 비즈프로필 URL
              {activePlatform === 'danggeun' && <span className="text-primary ml-1.5 text-xs font-semibold">(수집 중)</span>}
            </Label>
            <Input
              id="danggeun_review_url"
              name="danggeun_review_url"
              defaultValue={business.danggeun_review_url ?? ''}
              placeholder="https://www.daangn.com/..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kakao_place_url">
              카카오맵 후기 URL
              {activePlatform === 'kakao' && <span className="text-primary ml-1.5 text-xs font-semibold">(수집 중)</span>}
            </Label>
            <Input
              id="kakao_place_url"
              name="kakao_place_url"
              defaultValue={business.kakao_place_url ?? ''}
              placeholder="https://place.map.kakao.com/..."
            />
          </div>
        </div>
      </div>

      {/* SNS·영상 연동 */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">SNS·영상 연동</h2>
          <p className="text-xs text-muted-foreground mt-1">
            SNS 채널을 연결하면 홍보 페이지 하단에 노출되고, 검색·AI가 같은 업체로 인식해 신뢰도가 올라가요.
          </p>
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
        <div className="space-y-2">
          <Label htmlFor="instagram_url">인스타그램 URL</Label>
          <Input
            id="instagram_url"
            name="instagram_url"
            defaultValue={business.instagram_url ?? ''}
            placeholder="https://www.instagram.com/내계정"
          />
        </div>
      </div>

      {/* 후기 보상 설정 */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">후기 보상</h2>
          <p className="text-xs text-muted-foreground mt-1">후기를 남긴 고객에게 드릴 혜택을 설정하세요</p>
        </div>

        {/* 보상 유형 선택 */}
        <div className="space-y-2">
          <Label>보상 유형</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'none' as const,     label: '없음' },
              { value: 'discount' as const, label: '할인' },
              { value: 'gifticon' as const, label: '기프티콘' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setRewardCategory(opt.value)
                  setRewardValue('')
                }}
                className={`h-10 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                  rewardCategory === opt.value
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 할인 세부 설정 */}
        {rewardCategory === 'discount' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>할인 방식</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'discount_amount' as const, label: '금액 할인', placeholder: '예: 5000', suffix: '원' },
                  { value: 'discount_rate' as const,   label: '할인율',   placeholder: '예: 10',   suffix: '%' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDiscountType(opt.value)
                      setRewardValue('')
                    }}
                    className={`h-10 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                      discountType === opt.value
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 금액/율 입력 */}
            {discountType === 'discount_amount' ? (
              <div className="space-y-1.5">
                <Label htmlFor="reward_value">다음 방문 시 할인 금액</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="reward_value"
                    inputMode="numeric"
                    placeholder="5000"
                    value={rewardValue}
                    onChange={(e) => setRewardValue(e.target.value.replace(/[^0-9]/g, ''))}
                    className="text-right"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">원</span>
                </div>
                {rewardValue && (
                  <p className="text-xs text-primary">→ 고객에게 표시: 재방문 시 {Number(rewardValue).toLocaleString()}원 할인해 드려요</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="reward_value">다음 방문 시 할인율</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="reward_value"
                    inputMode="numeric"
                    placeholder="10"
                    value={rewardValue}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '')
                      if (Number(v) <= 100) setRewardValue(v)
                    }}
                    className="text-right"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                </div>
                {rewardValue && (
                  <p className="text-xs text-primary">→ 고객에게 표시: 재방문 시 {rewardValue}% 할인해 드려요</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 기프티콘 세부 설정 */}
        {rewardCategory === 'gifticon' && (
          <div className="space-y-1.5">
            <Label htmlFor="reward_value">기프티콘 종류</Label>
            <Input
              id="reward_value"
              placeholder="예: 스타벅스 아메리카노, 편의점 5천원권"
              value={rewardValue}
              onChange={(e) => setRewardValue(e.target.value)}
            />
            {rewardValue && (
              <p className="text-xs text-primary">→ 고객에게 표시: 후기 작성 시 {rewardValue} 기프티콘을 드려요</p>
            )}
          </div>
        )}
      </div>

      {/* 고객 추천사 */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">고객 추천사</h2>
          <p className="text-xs text-muted-foreground mt-1">
            실제 고객 후기를 직접 입력하면 홍보 페이지에 카드로 표시됩니다. 최대 3개까지 등록할 수 있어요.
          </p>
        </div>

        <div className="space-y-2">
          {testimonials.map((t, idx) => (
            <div key={idx} className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <Quote className="h-3 w-3" />
                  추천사 {idx + 1}
                </div>
                <button
                  type="button"
                  onClick={() => setTestimonials((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={t.quote}
                onChange={(e) => setTestimonials((prev) =>
                  prev.map((item, i) => i === idx ? { ...item, quote: e.target.value } : item)
                )}
                placeholder="예: 입주청소를 맡겼는데 정말 꼼꼼하게 해주셔서 만족했어요. 다음에도 또 부탁드릴게요!"
                maxLength={200}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
              <Input
                value={t.author}
                onChange={(e) => setTestimonials((prev) =>
                  prev.map((item, i) => i === idx ? { ...item, author: e.target.value } : item)
                )}
                placeholder="예: 강남구 이사청소 고객님"
                maxLength={30}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>

        {testimonials.length < 3 && (
          <button
            type="button"
            onClick={() => setTestimonials((prev) => [...prev, { quote: '', author: '' }])}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Plus className="h-4 w-4" />
            추천사 추가
          </button>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? '저장 중...' : '설정 저장'}
      </Button>
    </form>
  )
}
