'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateBusinessAction } from '@/lib/actions/settings'
import { CollapsibleSection } from './collapsible-section'
import { BrandDesignSection } from './brand-design-section'
import { StrengthsSection } from './strengths-section'
import { OwnerIntroSection } from './owner-intro-section'
import { CredentialsSection } from './credentials-section'
import { PortfolioSection, type PortfolioItem } from './portfolio-section'
import { CompletenessPanel, type CompletenessItem } from './completeness-panel'
import type { Strength } from '@/lib/business/strengths'
import { ServiceAreaPicker } from './service-area-picker'
import { BaseAddressPicker } from './base-address-picker'
import { normalizeHex, type HeroStyle } from '@/lib/brand'
import { parseKoreanRegion } from '@/lib/address/parse-region'
import { homeSidoAreaValues } from '@/lib/address/korea-regions'

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
  naver_blog_id: string | null
  danggeun_business_url: string | null
  service_areas: string[] | null
  review_reward_type: string
  review_reward_description: string | null
  logo_url: string | null
  favicon_url: string | null
  hero_image_url: string | null
  brand_color: string | null
  brand_color_secondary: string | null
  hero_style: string | null
  slug: string | null
  hero_title: string | null
  hero_subtitle: string | null
  strengths: Strength[] | null
  owner_photo_url: string | null
  owner_name: string | null
  owner_greeting: string | null
  owner_video_url: string | null
  experience_years: number | null
  business_number: string | null
  legal_name: string | null
  payment_account: string | null
  certifications: string[] | null
  portfolio: PortfolioItem[] | null
  target_customer: string | null
}

interface Props {
  business: Business
  serviceCount: number
  hasGeneratedPage: boolean
  publicReportCount: number
}

// 후기 보상(리뷰 쓰면 기프티콘·할인) 설정을 화면에서 숨긴다. — 2026-08-16
//
// 왜 숨겼나
//  1) 네이버 플레이스는 대가성 리뷰를 금지한다. 이 설정은 네이버 리뷰를 받는 흐름에 붙어 있어,
//     리뷰 몇 개 더 받으려다 검색 노출 제재를 받을 수 있다(공정위 추천·보증 심사지침도 대가 표시 의무).
//  2) 지급이 전부 수동이고 지급 여부를 기록하는 곳이 없다. 고객 화면엔 "업체에서 개별 안내 드려요"라고
//     약속이 뜨는데 사장님이 놓치면 안 주느니만 못한 결과가 된다.
//  3) 리뷰 수급률의 주된 레버는 보상이 아니라 요청 타이밍·작업 사진·사장님 이름으로 부탁하기다.
//
// 되살린다면 여기가 아니라 '리뷰 요청을 보내는 화면'에 건별로 두고, 지급 체크칸을 함께 만들 것.
// 프레임도 "리뷰 쓰면 5천원"이 아니라 "다음 이용 시 10% 할인"(재방문 유도)으로 바꿀 것.
// DB 컬럼(review_reward_type/description)과 고객 화면 로직은 그대로 살아 있다.
const SHOW_REVIEW_REWARD = false

export function SettingsForm({ business, serviceCount, hasGeneratedPage, publicReportCount }: Props) {
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

  // 홈페이지 디자인 상태
  const [brandColor, setBrandColor] = useState(business.brand_color ?? '')
  const [brandSecondary, setBrandSecondary] = useState(business.brand_color_secondary ?? '')
  const [heroStyle, setHeroStyle] = useState<HeroStyle>(
    business.hero_style === 'light' ? 'light' : 'dark',
  )
  const [logoUrl, setLogoUrl] = useState(business.logo_url ?? '')
  const [faviconUrl, setFaviconUrl] = useState(business.favicon_url ?? '')
  const [heroImageUrl, setHeroImageUrl] = useState(business.hero_image_url ?? '')
  const [heroTitle, setHeroTitle] = useState(business.hero_title ?? '')
  const [heroSubtitle, setHeroSubtitle] = useState(business.hero_subtitle ?? '')
  // 우리 업체 강점 — 홈페이지 "우리만의 차이" 섹션에 자동 반영
  const [strengths, setStrengths] = useState<Strength[]>(business.strengths ?? [])
  // 대표 인사말 — 얼굴 사진 + 이름 + 인사말 + 인사말 영상(유튜브)
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState(business.owner_photo_url ?? '')
  const [ownerName, setOwnerName] = useState(business.owner_name ?? '')
  const [ownerGreeting, setOwnerGreeting] = useState(business.owner_greeting ?? '')
  const [ownerVideoUrl, setOwnerVideoUrl] = useState(business.owner_video_url ?? '')
  // 전문성·신뢰 — 경력 연차 + 사업자등록번호 + 자격증/보유장비
  const [experienceYears, setExperienceYears] = useState(
    business.experience_years != null ? String(business.experience_years) : '',
  )
  const [businessNumber, setBusinessNumber] = useState(business.business_number ?? '')
  // 사업자등록증상 상호(법적 상호) — 계약서 '을' 상호에 사용(브랜드명과 다를 때)
  const [legalName, setLegalName] = useState(business.legal_name ?? '')
  // 정산(입금) 계좌 — 계약서 '을' 정보에 자동 표기
  const [paymentAccount, setPaymentAccount] = useState(business.payment_account ?? '')
  const [certifications, setCertifications] = useState<string[]>(business.certifications ?? [])
  // 시공 사례(비포·애프터) 직접 등록 + 주 고객 유형(B2B/B2C 카피 분기)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(business.portfolio ?? [])
  const [targetCustomer, setTargetCustomer] = useState<'b2b' | 'b2c'>(
    business.target_customer === 'b2b' ? 'b2b' : 'b2c',
  )

  // 업체 기본 정보 — 실시간 체크리스트 판정을 위해 상태로 관리
  const [name, setName] = useState(business.name ?? '')
  const [phone, setPhone] = useState(business.phone ?? '')
  const [description, setDescription] = useState(business.description ?? '')

  // 업체 주소 — 시/도·시군구 선택 기반 (상태로 들고 자동 지역 즉시 반영)
  const [address, setAddress] = useState(business.address ?? '')
  // 출장 지역 — 주소 기준 자동 노출 지역 + 사장님이 선택하는 추가 지역
  // 내 시/도 전체(모든 구·군) — 출장업 기본 서비스 지역(주소 시/도 기준 자동, 주소 바꾸면 갱신)
  const homeAreas = homeSidoAreaValues(address)
  // '더 출장 가는 지역' — 내 시/도 밖의 추가 지역만(초기값에서 내 시/도 중복 제거)
  const [serviceAreas, setServiceAreas] = useState<string[]>(() => {
    const home = new Set(homeSidoAreaValues(business.address))
    return (business.service_areas ?? []).filter((a) => !home.has(a))
  })

  // 홈페이지 주소(slug) — 저장 시 서버가 생성/반환하면 즉시 갱신해 미리보기 잠금 해제
  const [slug, setSlug] = useState<string | null>(business.slug)

  const { execute, isPending } = useAction(updateBusinessAction, {
    onSuccess: ({ data }) => {
      if (data?.slug) setSlug(data.slug)
      toast.success('설정이 저장됐어요!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요'),
  })

  // ── 홈페이지 공개 준비 체크리스트 (로고만 선택, 나머지는 필수) ──
  // 대표 사진은 여기 없다 — 비워도 색상 배경으로 정상 표시되므로 '필수'가 아니라
  // 아래 강화 항목(있으면 더 전문적으로 보임)으로 안내한다.
  const checklist = [
    { key: 'services',      label: '서비스와 가격 등록', done: serviceCount > 0 },
    { key: 'name',          label: '업체명',           done: !!name.trim() },
    { key: 'phone',         label: '전화번호',          done: !!phone.trim() },
    { key: 'address',       label: '주소',             done: !!address.trim() },
    { key: 'description',   label: '업체 소개',         done: !!description.trim() },
    { key: 'hero_title',    label: '페이지 제목',        done: !!heroTitle.trim() },
    { key: 'hero_subtitle', label: '페이지 소개글',      done: !!heroSubtitle.trim() },
    { key: 'geo',           label: '홈페이지 내용 만들기 (FAQ·검색 소개)', done: hasGeneratedPage },
  ]
  const allReady = checklist.every((c) => c.done)

  // ── 홈페이지 완성도(숨고식) — 필수(공개) + 강화(설득력) 통합 목록 ──
  const completenessItems: CompletenessItem[] = [
    ...checklist.map((c) => ({ key: c.key, label: c.label, done: c.done, essential: true })),
    { key: 'hero_image', label: '대표 사진', hint: '손님이 가장 먼저 보는 사진이에요 — 있으면 훨씬 전문적으로 보여요', done: !!heroImageUrl.trim(), essential: false },
    { key: 'owner_intro', label: '대표 인사말', hint: '사장님 얼굴·한마디면 신뢰가 확 올라가요', done: !!(ownerGreeting.trim() || ownerPhotoUrl.trim()), essential: false },
    { key: 'strengths', label: '우리 업체 강점', hint: '경쟁사와 다른 점을 카드로 보여줘요', done: strengths.filter((s) => s.title.trim()).length > 0, essential: false },
    { key: 'experience', label: '청소 경력 연차', hint: '“경력 N년”이 표시돼요', done: experienceYears.trim() !== '' && Number(experienceYears) > 0, essential: false },
    { key: 'business_number', label: '사업자 등록', hint: '‘사업자 등록 업체’ 배지가 붙어요', done: businessNumber.replace(/[^0-9]/g, '').length === 10, essential: false },
    { key: 'certifications', label: '자격증·보유장비', hint: '전문성을 증명하는 항목이에요', done: certifications.filter((c) => c.trim()).length > 0, essential: false },
    { key: 'portfolio', label: '시공 사례 사진 (비포·애프터)', hint: '청소는 사진이 가장 강력해요', done: publicReportCount > 0 || portfolio.some((p) => p.before?.trim() && p.after?.trim()), essential: false },
    { key: 'youtube', label: '시공 영상 (유튜브)', hint: '말보다 영상이 확실해요', done: !!business.youtube_url?.trim(), essential: false },
  ]

  // 해당 칸으로 데려가기 — 같은 페이지면 스크롤+포커스+테두리 강조, 다른 페이지는 이동.
  // 이미 채운 항목을 '수정'하러 갈 때도 쓰이므로, 그때는 빨간색(=오류처럼 보임) 대신
  // 브랜드 초록으로 "여기예요"만 알려준다.
  const jumpTo = (key: string, opts?: { done?: boolean }) => {
    if (key === 'services') {
      window.location.href = '/dashboard/services'
      return
    }
    const idMap: Record<string, string> = {
      name: 'field-name',
      phone: 'field-phone',
      address: 'field-address',
      description: 'field-description',
      hero_title: 'field-hero-title',
      hero_subtitle: 'field-hero-subtitle',
      hero_image: 'field-hero-image',
      geo: 'field-geo',
      save: 'field-save',
      owner_intro: 'field-owner-intro',
      strengths: 'field-strengths',
      experience: 'field-credentials',
      business_number: 'field-credentials',
      certifications: 'field-credentials',
      portfolio: 'field-portfolio',
      youtube: 'field-youtube',
    }
    const el = document.getElementById(idMap[key])
    if (!el) return
    // 접힌 아코디언 섹션 안이면 먼저 펼친다(안 그러면 스크롤해도 내용이 안 보임)
    const details = el.closest('details')
    if (details) details.open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Tailwind purge 영향 없이 인라인 스타일로 잠깐 강조
    el.style.outline = `2px solid ${opts?.done ? '#059669' : '#ef4444'}`
    el.style.outlineOffset = '4px'
    el.style.borderRadius = '10px'
    // GEO 패널은 내부에 여러 입력칸이 있어 자동 포커스가 오히려 헷갈림 → 스크롤+강조만
    if (key !== 'geo') {
      const input = el.querySelector('input, textarea') as HTMLElement | null
      window.setTimeout(() => input?.focus(), 350)
    }
    window.setTimeout(() => {
      el.style.outline = ''
      el.style.outlineOffset = ''
    }, 2600)
  }

  // "내 홈페이지 열어보기" 클릭
  //
  // 체크리스트가 덜 찼다고 막지 않는다. 홈페이지는 이미 공개돼 있고, 사장님이 카카오톡으로
  // 뿌리는 '고객 견적 요청 링크'(/q/…)가 서비스가 하나라도 있으면 곧장 /biz/[slug]로 보낸다.
  // 즉 고객은 이미 보고 있는 페이지인데 정작 사장님만 못 보는 상태였다 → 고칠 곳도 알 수 없었음.
  // 아직 주소(slug)가 없어 페이지 자체가 없을 때만 막는다.
  const handlePreviewClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!slug) {
      // 저장 전이라 주소가 아직 안 만들어짐 → 저장해야 홈페이지가 생긴다
      e.preventDefault()
      toast.error('먼저 아래 저장하기를 눌러 홈페이지를 만들어 주세요')
      jumpTo('save')
      return
    }
    // 앵커가 /biz/[slug]를 새 창으로 정상 오픈
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)

    // 보상 타입 결정
    let rewardType: string = 'none'
    if (rewardCategory === 'discount') rewardType = discountType
    else if (rewardCategory === 'gifticon') rewardType = 'gifticon'

    execute({
      name:                      name,
      phone:                     phone,
      address:                   address,
      description:               description,
      naver_place_url:           data.get('naver_place_url') as string,
      google_place_url:          data.get('google_place_url') as string,
      danggeun_review_url:       data.get('danggeun_review_url') as string,
      kakao_place_url:           data.get('kakao_place_url') as string,
      active_review_platform:    activePlatform,
      youtube_url:               data.get('youtube_url') as string,
      instagram_url:             data.get('instagram_url') as string,
      naver_blog_url:            data.get('naver_blog_url') as string,
      danggeun_business_url:     data.get('danggeun_business_url') as string,
      // 내 시/도 전체(자동) + 더 출장 가는 지역(수동)을 합쳐 저장
      service_areas:             [...new Set([...homeAreas, ...serviceAreas])].join(','),
      review_reward_type:        rewardType,
      review_reward_description: rewardCategory === 'none' ? '' : rewardValue,
      brand_color:               normalizeHex(brandColor) ?? '',
      brand_color_secondary:     normalizeHex(brandSecondary) ?? '',
      hero_style:                heroStyle,
      logo_url:                  logoUrl.trim(),
      favicon_url:               faviconUrl.trim(),
      hero_image_url:            heroImageUrl.trim(),
      hero_title:                heroTitle.trim(),
      hero_subtitle:             heroSubtitle.trim(),
      // 제목 있는 강점만 저장 (빈 카드 제외)
      strengths:                 JSON.stringify(
        strengths.filter((s) => s.title.trim())
      ),
      owner_photo_url:           ownerPhotoUrl.trim(),
      owner_name:                ownerName.trim(),
      owner_greeting:            ownerGreeting.trim(),
      owner_video_url:           ownerVideoUrl.trim(),
      experience_years:          experienceYears.trim(),
      business_number:           businessNumber.trim(),
      legal_name:                legalName.trim(),
      payment_account:           paymentAccount.trim(),
      certifications:            JSON.stringify(certifications.filter((c) => c.trim())),
      // 작업 전·후 두 장이 모두 있는 시공 사례만 저장
      portfolio:                 JSON.stringify(
        portfolio.filter((p) => p.before.trim() && p.after.trim())
      ),
      target_customer:           targetCustomer,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-28">
      {/* 홈페이지 완성도(숨고식) — 채울수록 설득력이 강해진다는 걸 % 진행바로 안내 */}
      <CompletenessPanel items={completenessItems} onJump={jumpTo} />

      {/* 업체 기본 정보 (주 고객 유형 포함) */}
      <CollapsibleSection title="기본 정보" defaultOpen>

        <div id="field-name" className="space-y-2">
          <Label htmlFor="name">업체명 <span className="text-destructive">(필수)</span></Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 깔끔청소 홍길동"
            required
          />
        </div>

        <div id="field-phone" className="space-y-2">
          <Label htmlFor="phone">전화번호 <span className="text-destructive">(필수)</span></Label>
          <Input
            id="phone"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="01012345678"
          />
        </div>

        <div id="field-address" className="space-y-2">
          <Label>주소 <span className="text-destructive">(필수)</span></Label>
          <BaseAddressPicker value={address} onChange={setAddress} />
        </div>

        <div id="field-description" className="space-y-2">
          <Label htmlFor="description">업체 소개 <span className="text-destructive">(필수)</span></Label>
          <Input
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="10년 경력의 청소 전문 업체입니다"
          />
          <p className="text-xs text-muted-foreground">고객 견적 폼 상단에 표시됩니다</p>
        </div>

        {/* 주 고객 유형 — 홈페이지 카피(공감·프로세스)를 B2B/B2C에 맞게 분기 */}
        <div className="space-y-2 pt-4 border-t">
          <div>
            <Label>주 고객 유형</Label>
            <p className="text-xs text-muted-foreground mt-1">
              누구에게 청소를 파는지에 따라 홈페이지 문구가 자동으로 맞춰져요.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'b2b' as const, label: '상업공간 (B2B)', desc: '사무실·상가·병원·공장 정기청소' },
            { value: 'b2c' as const, label: '가정 (B2C)', desc: '이사·입주·가정 청소' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTargetCustomer(opt.value)}
              className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                targetCustomer === opt.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'hover:bg-muted'
              }`}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</span>
            </button>
          ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* 출장 지역 (검색 노출) */}
      <CollapsibleSection
        title="출장 지역"
        description="위 주소 기준으로 검색 노출 지역이 자동 설정돼요. 더 멀리 가시면 추가하세요."
      >

        {/* 내 시/도 전체 — 주소 기준 자동 설정(출장업이라 내 지역은 전부 포함) */}
        {homeAreas.length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">자동 설정된 지역 (내 지역 전체)</Label>
            <div className="flex flex-wrap gap-1.5">
              {homeAreas.map((a) => (
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
      </CollapsibleSection>

      {/* 홈페이지 디자인 (브랜드 커스터마이징) */}
      <CollapsibleSection title="홈페이지 디자인">
      <BrandDesignSection
        businessId={business.id}
        businessName={name || business.name}
        slug={slug}
        checklist={checklist}
        allReady={allReady}
        onJump={jumpTo}
        onPreviewClick={handlePreviewClick}
        brandColor={brandColor}
        brandSecondary={brandSecondary}
        heroStyle={heroStyle}
        logoUrl={logoUrl}
        faviconUrl={faviconUrl}
        heroImageUrl={heroImageUrl}
        heroTitle={heroTitle}
        heroSubtitle={heroSubtitle}
        onChange={(next) => {
          if (next.brandColor !== undefined) setBrandColor(next.brandColor)
          if (next.brandSecondary !== undefined) setBrandSecondary(next.brandSecondary)
          if (next.heroStyle !== undefined) setHeroStyle(next.heroStyle)
          if (next.logoUrl !== undefined) setLogoUrl(next.logoUrl)
          if (next.faviconUrl !== undefined) setFaviconUrl(next.faviconUrl)
          if (next.heroImageUrl !== undefined) setHeroImageUrl(next.heroImageUrl)
          if (next.heroTitle !== undefined) setHeroTitle(next.heroTitle)
          if (next.heroSubtitle !== undefined) setHeroSubtitle(next.heroSubtitle)
        }}
      />
      </CollapsibleSection>

      {/* 우리 업체 강점 (홈페이지 '우리만의 차이'에 자동 반영) */}
      <CollapsibleSection title="우리 업체 강점">
        <div id="field-strengths">
          <StrengthsSection value={strengths} onChange={setStrengths} />
        </div>
      </CollapsibleSection>

      {/* 대표 인사말 (홈페이지 '대표 인사말' 섹션에 자동 반영) */}
      <CollapsibleSection title="대표 인사말">
      <div id="field-owner-intro">
        <OwnerIntroSection
          photoUrl={ownerPhotoUrl}
          name={ownerName}
          greeting={ownerGreeting}
          videoUrl={ownerVideoUrl}
          onChange={(next) => {
            if (next.photoUrl !== undefined) setOwnerPhotoUrl(next.photoUrl)
            if (next.name !== undefined) setOwnerName(next.name)
            if (next.greeting !== undefined) setOwnerGreeting(next.greeting)
            if (next.videoUrl !== undefined) setOwnerVideoUrl(next.videoUrl)
          }}
        />
      </div>
      </CollapsibleSection>

      {/* 전문성·신뢰 (경력·사업자·자격증 → 홈페이지 상단 신뢰 앵커) */}
      <CollapsibleSection title="전문성·신뢰 (경력·자격증)">
      <div id="field-credentials">
        <CredentialsSection
          experienceYears={experienceYears}
          businessNumber={businessNumber}
          certifications={certifications}
          onChange={(next) => {
            if (next.experienceYears !== undefined) setExperienceYears(next.experienceYears)
            if (next.businessNumber !== undefined) setBusinessNumber(next.businessNumber)
            if (next.certifications !== undefined) setCertifications(next.certifications)
          }}
        />
      </div>
      </CollapsibleSection>

      {/* 계약서·세금계산서 정보 — 계약서 '을'(수급자) 정보에 자동 표기 */}
      <CollapsibleSection
        title="계약서·세금계산서 정보"
        description="계약서 '을'(수급자) 정보에 자동으로 들어가요. 한 번만 넣어두면 계약서마다 다시 안 적어도 돼요. (선택)"
      >

        <div className="space-y-1.5">
          <Label htmlFor="legal_name" className="text-xs">사업자 상호 (사업자등록증상 이름)</Label>
          <Input
            id="legal_name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="예: 다트챌린지"
            maxLength={60}
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            브랜드·홍보에 쓰는 업체명과 사업자등록증상 상호가 다르면 여기에 등록증상 상호를 넣으세요.
            계약서·세금계산서엔 이 이름이 들어가요(사업자등록번호와 일치해야 함). 비우면 위 업체명을 그대로 써요.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment_account" className="text-xs">정산(입금) 계좌</Label>
          <Input
            id="payment_account"
            value={paymentAccount}
            onChange={(e) => setPaymentAccount(e.target.value)}
            placeholder="예: 국민은행 123456-78-901234 (예금주: 류승찬)"
            maxLength={80}
          />
        </div>
      </CollapsibleSection>

      {/* 시공 사례 (비포·애프터 직접 등록 → 홈페이지 '시공 사례' 갤러리에 자동 반영) */}
      <CollapsibleSection title="시공 사례 (비포·애프터)">
        <div id="field-portfolio">
          <PortfolioSection value={portfolio} onChange={setPortfolio} />
        </div>
      </CollapsibleSection>

      {/* 리뷰 수집 채널 (후기 보상 포함) */}
      <CollapsibleSection title="리뷰 수집 채널">
        <div>
          <p className="text-xs text-muted-foreground">
            리뷰 요청 알림톡에 연결할 채널을 선택하세요. 한 채널에 리뷰가 모이면 다른 채널로 전환할 수 있어요.
          </p>
          <div className="mt-2.5 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
            <p className="text-xs text-foreground/80 leading-relaxed">
              <span className="font-semibold text-primary">네이버·구글 주소를 연결하면</span> 작업이 끝난 고객에게
              리뷰 요청 알림톡이 자동으로 나가고, 검색·AI가 우리 업체를 같은 곳으로 인식해
              <span className="font-semibold"> AI 검색 노출</span>에도 도움이 돼요. 한 곳만 연결해도 켜집니다.
            </p>
          </div>
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

        {/* 후기 보상 — 2026-08-16 숨김. 지우지 말고 이 플래그만 켜서 되살릴 것 */}
        {SHOW_REVIEW_REWARD && (
        <div className="space-y-4 pt-4 border-t">
          <div>
            <Label>후기 보상</Label>
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
        )}
      </CollapsibleSection>

      {/* SNS·영상 연동 */}
      <CollapsibleSection
        title="SNS·영상 연동"
        description="SNS를 연결하면 홈페이지 하단에 노출되고, 검색·AI가 같은 업체로 인식해 신뢰도가 올라가요."
      >
        <div id="field-youtube" className="space-y-2">
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
        <div className="space-y-2">
          <Label htmlFor="naver_blog_url">내 네이버 블로그 주소</Label>
          <Input
            id="naver_blog_url"
            name="naver_blog_url"
            defaultValue={business.naver_blog_id ? `https://blog.naver.com/${business.naver_blog_id}` : ''}
            placeholder="https://blog.naver.com/내아이디"
          />
          <p className="text-xs text-muted-foreground">
            홍보 글을 복사한 뒤 <span className="font-medium text-foreground">블로그 열기</span>를 누르면 이 블로그의 글쓰기 화면으로 바로 연결돼요
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="danggeun_business_url">내 당근 비즈프로필 주소</Label>
          <Input
            id="danggeun_business_url"
            name="danggeun_business_url"
            defaultValue={business.danggeun_business_url ?? ''}
            placeholder="https://www.daangn.com/kr/business-profiles/..."
          />
          <p className="text-xs text-muted-foreground">
            넣어두면 <span className="font-medium text-foreground">당근 열기</span>를 눌렀을 때 내 비즈프로필로 연결돼요. 비워두면 당근 비즈니스 홈으로 연결돼요
          </p>
        </div>
      </CollapsibleSection>

      {/* 저장 버튼 — 화면 하단 고정(fixed). 모바일은 탭바 위, 데스크탑은 사이드바 옆 정렬 */}
      <div className="fixed left-0 right-0 md:left-56 z-30 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:bottom-0 border-t bg-background/95 backdrop-blur px-4 py-3 md:px-6">
        <div id="field-save" className="max-w-xl">
          <Button type="submit" disabled={isPending} className="w-full h-12 text-base font-bold">
            {isPending ? '저장 중...' : '설정 저장하기'}
          </Button>
        </div>
      </div>
    </form>
  )
}
