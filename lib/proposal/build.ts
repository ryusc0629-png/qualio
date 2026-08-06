// 소개서 렌더 데이터 조립 — businesses 필드 + proposal_settings 표준문구를 합쳐
// 인쇄 컴포넌트가 그대로 그릴 수 있는 형태로 만든다.
import {
  DEFAULT_SECTIONS,
  PROPOSAL_CATEGORIES,
  STANDARD_COPY,
  resolveTheme,
  type ProposalCategory,
  type ProposalCategoryDef,
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
}

export interface ProposalRenderData {
  businessName: string
  coverKicker: string
  coverTagline: string
  theme: ProposalTheme
  category: ProposalCategoryDef
  sections: ProposalSectionToggles
  stats: ProposalStat[]
  trustCards: DefaultTrustCard[]
  logoUrl: string | null
  investmentPhoto: string | null
  categoryPhoto: string | null
  phone: string | null
  address: string | null
  bizUrl: string | null
}

const PUBLIC_ORIGIN = 'https://qualio.co.kr'

export function buildProposalData(
  business: ProposalBusiness,
  settings: ProposalSettings | null,
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

  // 사진 — 시공사례(portfolio) 우선, 없으면 히어로 이미지
  const portfolio = business.portfolio ?? []
  const photoAt = (i: number) => portfolio[i]?.after || portfolio[i]?.before || null
  const investmentPhoto = photoAt(0) || business.hero_image_url
  const categoryPhoto = photoAt(1) || photoAt(0) || business.hero_image_url

  return {
    businessName: business.name,
    coverKicker: (s.kicker && s.kicker.trim()) || category.kicker,
    coverTagline: (s.headline && s.headline.trim()) || business.hero_subtitle || '당연한 일을, 철저하게 합니다',
    theme,
    category,
    sections: s.sections ?? DEFAULT_SECTIONS,
    stats: (s.stats ?? []).filter((x) => x.value.trim() && x.label.trim()).slice(0, 3),
    trustCards,
    logoUrl: business.logo_url,
    investmentPhoto,
    categoryPhoto,
    phone: business.phone,
    address: business.address,
    bizUrl: business.slug ? `${PUBLIC_ORIGIN}/biz/${business.slug}?ch=proposal` : null,
  }
}
