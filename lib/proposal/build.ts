// 소개서 렌더 데이터 조립 — businesses 필드 + proposal_settings 표준문구를 합쳐
// 인쇄 컴포넌트가 그대로 그릴 수 있는 형태로 만든다.
import {
  DEFAULT_SECTIONS,
  PROPOSAL_CATEGORIES,
  STANDARD_COPY,
  fillName,
  resolveTheme,
  type ProposalCategory,
  type ProposalCategoryDef,
  type ProposalDesignId,
  type ProposalSectionToggles,
  type ProposalSettings,
  type ProposalStat,
  type ProposalTheme,
  type DefaultTrustCard,
} from './content'

// businesses에서 소개서에 쓰는 필드(리치 컬럼은 database.ts 타입에 없어 여기서 명시)
export interface ProposalBusiness {
  name: string
  phone: string | null
  address: string | null
  slug: string | null
  logo_url: string | null
  hero_image_url: string | null
  brand_color: string | null
  brand_color_secondary: string | null
  description: string | null
  hero_subtitle: string | null
  strengths: { key?: string; title: string; desc: string }[] | null
  portfolio: { before?: string; after?: string; caption?: string }[] | null
  // 홈페이지 설정에 이미 적어 둔 값들 — 소개서에 그대로 옮겨 담는다
  owner_photo_url: string | null
  owner_name: string | null
  owner_greeting: string | null
  experience_years: number | null
  certifications: string[] | null
  service_areas: string[] | null
}

// 홈페이지에서 끌어온 부가 데이터(테이블 조회가 필요한 것들)
export interface ProposalBeforeAfter {
  before: string
  after: string
}

export interface ProposalReview {
  rating: number
  comment: string
  customerName: string
}

export interface ProposalExtras {
  beforeAfter: ProposalBeforeAfter[] // 시공 사례(직접 등록 + 홈 공개한 작업 보고)
  photoPool: string[]                // 사진 고르기용 후보(중복 제거)
  reviews: ProposalReview[]          // 실제 공개 후기만
  reviewCount: number
  reviewAvg: number
  services: string[]                 // 서비스 항목 이름
}

export const EMPTY_EXTRAS: ProposalExtras = {
  beforeAfter: [],
  photoPool: [],
  reviews: [],
  reviewCount: 0,
  reviewAvg: 0,
  services: [],
}

export interface ProposalOwnerBlock {
  photo: string | null
  name: string
  greeting: string
  badges: string[] // 경력·자격증
}

export interface ProposalRenderData {
  businessName: string
  design: ProposalDesignId
  coverKicker: string
  coverTagline: string
  theme: ProposalTheme
  category: ProposalCategoryDef
  sections: ProposalSectionToggles
  stats: ProposalStat[]
  trustCards: DefaultTrustCard[]
  logoUrl: string | null
  coverPhoto: string | null
  investmentPhoto: string | null
  categoryPhoto: string | null
  owner: ProposalOwnerBlock | null
  beforeAfter: ProposalBeforeAfter[]
  reviews: ProposalReview[]
  reviewCount: number
  reviewAvg: number
  services: string[]
  serviceAreas: string[]
  phone: string | null
  address: string | null
  bizUrl: string | null
}

const PUBLIC_ORIGIN = 'https://qualio.co.kr'

// A4 한 장 높이가 고정이라 너무 긴 글은 페이지 밖으로 잘린다. 넘치기 전에 줄여서 담는다.
function clip(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export function buildProposalData(
  business: ProposalBusiness,
  settings: ProposalSettings | null,
  extras: ProposalExtras = EMPTY_EXTRAS,
): ProposalRenderData {
  const s = settings ?? {}
  const categoryId: ProposalCategory = s.category ?? 'general'
  const category = PROPOSAL_CATEGORIES[categoryId] ?? PROPOSAL_CATEGORIES.general
  const theme = resolveTheme(s.theme, business.brand_color, business.brand_color_secondary)

  // 강점(strengths)이 있으면 '믿고 맡기는 이유' 카드를 업체 강점으로 채운다(고유자산 반영)
  const strengths = business.strengths ?? []
  const trustCards: DefaultTrustCard[] =
    strengths.length > 0
      ? strengths.slice(0, 4).map((st, i) => ({
          emoji: STANDARD_COPY.defaultTrustCards[i]?.emoji ?? '✅',
          title: st.title,
          desc: st.desc,
        }))
      : STANDARD_COPY.defaultTrustCards

  // 사진 — 사장님이 고른 사진이 1순위, 없으면 시공사례(애프터) → 히어로 이미지 순으로 자동
  const autoPhotos = extras.photoPool.length > 0 ? extras.photoPool : []
  const portfolio = business.portfolio ?? []
  const portfolioPhoto = (i: number) => portfolio[i]?.after || portfolio[i]?.before || null
  const autoAt = (i: number) => portfolioPhoto(i) || autoPhotos[i] || business.hero_image_url || null

  const photos = s.photos ?? {}
  const coverPhoto = photos.cover || autoAt(0)
  const investmentPhoto = photos.investment || autoAt(0)
  const categoryPhoto = photos.category || autoAt(1) || autoAt(0)

  // 대표 인사말 — 홈페이지 설정값 사용. 인사말을 안 적었으면 표준문구로 대체한다.
  const ownerPhoto = photos.owner || business.owner_photo_url
  const ownerName = (business.owner_name ?? '').trim()
  const ownerGreeting = (business.owner_greeting ?? '').trim()
  const hasOwner = !!(ownerPhoto || ownerGreeting || ownerName)
  const badges: string[] = []
  if (business.experience_years && business.experience_years > 0) {
    badges.push(`청소 경력 ${business.experience_years}년`)
  }
  badges.push(...(business.certifications ?? []).filter((c) => c.trim()).slice(0, 5))

  const owner: ProposalOwnerBlock | null = hasOwner
    ? {
        photo: ownerPhoto,
        name: ownerName || `${business.name} 대표`,
        greeting: clip(ownerGreeting || fillName(STANDARD_COPY.ownerFallbackGreeting, business.name), 420),
        badges,
      }
    : null

  return {
    businessName: business.name,
    design: s.design ?? 'classic',
    coverKicker: (s.kicker && s.kicker.trim()) || category.kicker,
    coverTagline: (s.headline && s.headline.trim()) || business.hero_subtitle || '당연한 일을, 철저하게 합니다',
    theme,
    category,
    sections: { ...DEFAULT_SECTIONS, ...(s.sections ?? {}) },
    stats: (s.stats ?? []).filter((x) => x.value.trim() && x.label.trim()).slice(0, 3),
    trustCards,
    logoUrl: business.logo_url,
    coverPhoto,
    investmentPhoto,
    categoryPhoto,
    owner,
    beforeAfter: extras.beforeAfter.slice(0, 4),
    reviews: extras.reviews.slice(0, 4).map((r) => ({ ...r, comment: clip(r.comment, 150) })),
    reviewCount: extras.reviewCount,
    reviewAvg: extras.reviewAvg,
    services: extras.services.slice(0, 8),
    serviceAreas: (business.service_areas ?? []).slice(0, 8),
    phone: business.phone,
    address: business.address,
    bizUrl: business.slug ? `${PUBLIC_ORIGIN}/biz/${business.slug}?ch=proposal` : null,
  }
}
