// 소개서(제안서) 표준문구 엔진.
// 원칙: 업체마다 다른 값(업체명·로고·색·강점·시공사례)은 businesses에서 자동으로 끌어오고,
// 반복되는 설득 카피는 여기 표준문구로 고정한다(시방서 spec-sheet 패턴).
// 업체명은 {업체명} 토큰으로 치환한다.

export type ProposalCategory = 'general' | 'hospital' | 'office' | 'store' | 'interior'
export type ProposalThemeId = 'brand' | 'emerald' | 'gold' | 'slate'

// 소개서 전용 저장값(businesses.proposal_settings) — 소수 입력만 담는다
export interface ProposalStat {
  value: string // 예: '3'
  unit: string  // 예: '년'
  label: string // 예: '정기청소를 운영해 온 시간'
}

export interface ProposalSettings {
  template?: string
  category?: ProposalCategory
  theme?: ProposalThemeId
  headline?: string // 표지 큰 강조 문구(비면 업체 소개로 대체)
  kicker?: string   // 표지 상단 한 줄(지역·포지셔닝). 비면 카테고리 기본값
  stats?: ProposalStat[]
  sections?: ProposalSectionToggles
}

export interface ProposalSectionToggles {
  investment: boolean
  principles: boolean
  refund: boolean
  process: boolean
  trust: boolean
}

export const DEFAULT_SECTIONS: ProposalSectionToggles = {
  investment: true,
  principles: true,
  refund: true,
  process: true,
  trust: true,
}

// ── 디자인 테마 ─────────────────────────────────────────────
export interface ProposalTheme {
  id: ProposalThemeId
  name: string
  primary: string      // 포인트(강조) 색
  primaryDark: string  // 진한 포인트(텍스트·그림자)
  accentPale: string   // 아주 옅은 배경 톤(사이드바)
  ink: string          // 본문 잉크
  inkSoft: string
}

export const PROPOSAL_THEMES: Record<Exclude<ProposalThemeId, 'brand'>, ProposalTheme> = {
  emerald: { id: 'emerald', name: '에메랄드', primary: '#10b981', primaryDark: '#047857', accentPale: '#ecfdf5', ink: '#1f2a24', inkSoft: '#55605a' },
  gold:    { id: 'gold',    name: '골드',     primary: '#e6b800', primaryDark: '#a67c00', accentPale: '#fbf7c6', ink: '#2c2d28', inkSoft: '#5c5d55' },
  slate:   { id: 'slate',   name: '차분한 그레이', primary: '#64748b', primaryDark: '#334155', accentPale: '#f1f5f9', ink: '#1e293b', inkSoft: '#556070' },
}

export const THEME_CHOICES: { id: ProposalThemeId; name: string }[] = [
  { id: 'brand', name: '내 브랜드 색' },
  { id: 'emerald', name: '에메랄드' },
  { id: 'gold', name: '골드' },
  { id: 'slate', name: '차분한 그레이' },
]

// 선택 테마 → 실제 색. 'brand'면 업체 브랜드색을 쓰고, 없으면 에메랄드로 대체.
export function resolveTheme(
  themeId: ProposalThemeId | undefined,
  brandColor: string | null | undefined,
  brandColorSecondary: string | null | undefined,
): ProposalTheme {
  if (themeId === 'brand' || themeId === undefined) {
    if (brandColor) {
      return {
        id: 'brand',
        name: '내 브랜드 색',
        primary: brandColor,
        primaryDark: brandColorSecondary || brandColor,
        accentPale: hexToPale(brandColor),
        ink: '#1f2a24',
        inkSoft: '#55605a',
      }
    }
    return PROPOSAL_THEMES.emerald
  }
  return PROPOSAL_THEMES[themeId]
}

// 포인트 색을 아주 옅은 배경 톤으로 (사이드바용). 대략적인 화이트 믹스.
function hexToPale(hex: string): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return '#eef7f2'
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * 0.9)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// ── 대상 공간 카테고리 ───────────────────────────────────────
export interface SpaceCard {
  emoji: string
  title: string
  desc: string
}

export interface ProposalCategoryDef {
  id: ProposalCategory
  name: string           // 선택 UI용
  kicker: string         // 표지 상단 기본 문구
  sideTitle: string      // '대상 공간' 섹션 사이드 제목
  sideLines: string[]    // 사이드 설명(강조는 **로 감싸 굵게)
  cards: SpaceCard[]      // 관리 대상 공간 카드
}

export const PROPOSAL_CATEGORIES: Record<ProposalCategory, ProposalCategoryDef> = {
  general: {
    id: 'general',
    name: '통합 (여러 공간)',
    kicker: '상업공간 관리 전문',
    sideTitle: '공간마다\n필요한 관리가\n다릅니다',
    sideLines: [
      '병원·학교·사무실·상가는 **완전히 다른 공간**입니다.',
      '보이는 쓰레기 치우고 바닥만 닦아서는, 정작 중요한 문제를 해결할 수 없습니다.',
      '공간의 특성에 맞는 **전문 관리**가 필요합니다.',
    ],
    cards: [
      { emoji: '🏥', title: '병원 · 의원', desc: "'보이는 청결'을 넘어선 '안전'. 구역별 소독과 교차 감염 방지 관리." },
      { emoji: '🏢', title: '사무실 · 오피스', desc: '직원 집중력과 회사 이미지. 책상 밑 구석까지 깨끗하게.' },
      { emoji: '🏬', title: '상가 · 상업공간', desc: '방문 고객에게 전하는 무언의 신뢰. 첫인상을 관리합니다.' },
      { emoji: '🎓', title: '학원 · 시설', desc: '수많은 사람이 오가는 공간을 매일 새것처럼. 구석까지 꼼꼼히.' },
    ],
  },
  hospital: {
    id: 'hospital',
    name: '병원 · 의원',
    kicker: '병원·의원 위생관리 전문',
    sideTitle: '병원은\n아무 데나\n맡기면 안 됩니다',
    sideLines: [
      '병원은 일반 상가·사무실과 **완전히 다른 공간**입니다.',
      '면역력이 약한 환자가 머무는 곳, **안전**이 청결보다 먼저입니다.',
      '구역별 소독과 교차 감염 방지 — **전문 관리**가 필요합니다.',
    ],
    cards: [
      { emoji: '🏥', title: '진료·처치 구역', desc: '교차 감염 방지를 위한 구역별 도구 분리와 소독 관리.' },
      { emoji: '🚻', title: '대기실 · 화장실', desc: '환자가 가장 많이 머무는 곳. 위생과 냄새까지 관리합니다.' },
      { emoji: '🌬️', title: '공기 순환 구역', desc: '호흡기와 직결되는 환풍구·필터 집중 케어.' },
      { emoji: '🧴', title: '접점 표면', desc: '손잡이·접수대 등 손이 닿는 곳을 반복 소독합니다.' },
    ],
  },
  office: {
    id: 'office',
    name: '사무실 · 오피스',
    kicker: '오피스 정기관리 전문',
    sideTitle: '깨끗한 사무실이\n직원 집중력을\n바꿉니다',
    sideLines: [
      '직원이 쓰레기통 비우고 먼지 닦는 시간에, **본래 업무에 집중**하게 해주세요.',
      '책상 밑 구석, 환풍구 먼지까지 — 눈에 안 보이는 곳이 회사 이미지를 만듭니다.',
      '공간의 특성에 맞는 **정기 관리**가 필요합니다.',
    ],
    cards: [
      { emoji: '🖥️', title: '업무 공간', desc: '책상 밑·모니터 뒤 구석 먼지까지 매일 같은 퀄리티로.' },
      { emoji: '☕', title: '탕비실 · 휴게실', desc: '직원이 매일 쓰는 공간의 위생을 꼼꼼히 관리합니다.' },
      { emoji: '🚻', title: '화장실', desc: '냄새·물때까지 관리해 방문객 첫인상을 지킵니다.' },
      { emoji: '🪟', title: '로비 · 회의실', desc: '고객을 맞는 공간을 늘 새것처럼 되돌려 놓습니다.' },
    ],
  },
  store: {
    id: 'store',
    name: '상가 · 상업공간',
    kicker: '상업공간 청결관리 전문',
    sideTitle: '첫인상이\n매출을\n만듭니다',
    sideLines: [
      '방문 고객이 가장 먼저 느끼는 건 **공간의 청결**입니다.',
      '지저분함은 곧 신뢰의 손실 — 첫인상 관리가 매출로 이어집니다.',
      '업종에 맞는 **집중 관리**가 필요합니다.',
    ],
    cards: [
      { emoji: '🚪', title: '입구 · 매장 전면', desc: '고객이 처음 마주하는 첫인상 구역을 늘 깔끔하게.' },
      { emoji: '🪑', title: '고객 이용 공간', desc: '테이블·좌석 등 손님이 머무는 곳을 청결하게 유지.' },
      { emoji: '🚻', title: '화장실', desc: '매장 평가를 좌우하는 곳. 냄새·물때까지 관리합니다.' },
      { emoji: '✨', title: '유리 · 바닥', desc: '얼룩 없는 유리와 광나는 바닥으로 매장 격을 올립니다.' },
    ],
  },
  interior: {
    id: 'interior',
    name: '인테리어 후 대청소',
    kicker: '준공·입주 특수청소 전문',
    sideTitle: '새 공간의\n첫 단추를\n깔끔하게',
    sideLines: [
      '화려한 조명과 새 가구 뒤에는 **시멘트 가루·톱밥·본드 찌꺼기**가 숨어 있습니다.',
      '보이는 것만 치워서는 새 공간이 완성되지 않습니다.',
      '마감재를 상하지 않게 되살리는 **전문 대청소**가 필요합니다.',
    ],
    cards: [
      { emoji: '🧱', title: '공사 잔여물 제거', desc: '폐기물·보양지 제거, 바닥·벽면 굵은 오염물 1차 정리.' },
      { emoji: '🌫️', title: '숨은 먼지 흡진', desc: '천장 틈새·몰딩·수납장 안쪽 미세먼지까지 장비로 제거.' },
      { emoji: '🪟', title: '마감재별 세정', desc: '유리·금속·목재 소재에 맞는 전용 세정제로 안전하게.' },
      { emoji: '🔍', title: '최종 점검', desc: '체크리스트로 구석까지 다시 확인해 티끌 없이 마무리.' },
    ],
  },
}

export const CATEGORY_CHOICES: { id: ProposalCategory; name: string }[] =
  (Object.values(PROPOSAL_CATEGORIES) as ProposalCategoryDef[]).map((c) => ({ id: c.id, name: c.name }))

// ── 표준 설득 카피(모든 업체 공통, 업체명만 치환) ───────────────
export interface PrincipleItem { title: string; desc: string }
export interface ProcessStep { title: string; desc: string }
export interface RefundCard { title: string; desc: string }
export interface PrepPill { title: string; desc: string }
export interface DefaultTrustCard { emoji: string; title: string; desc: string }

export interface StandardCopy {
  investmentParas: string[]
  investmentPull: string
  principlesTitle: string
  principles: PrincipleItem[]
  refundBadge: string
  refundTitle: string
  refundLead: string
  refundCards: RefundCard[]
  refundPromise: string
  processTitle: string
  processSideTitle: string
  processSideLines: string[]
  process: ProcessStep[]
  trustTitle: string
  trustLead: string
  defaultTrustCards: DefaultTrustCard[]
  ctaTitle: string
  ctaLead: string
  prepPills: PrepPill[]
}

// {업체명} 토큰을 실제 업체명으로 치환
export function fillName(text: string, name: string): string {
  return text.replaceAll('{업체명}', name)
}

export const STANDARD_COPY: StandardCopy = {
  investmentParas: [
    "많은 대표님·원장님들이 청소를 그저 '어쩔 수 없이 지출하는 고정 비용'으로 생각하십니다.",
    '하지만 매일 직원이 출근하고 고객이 방문하는 공간의 상태는, 단순한 청결을 넘어 **사업 성과에 직접 영향**을 줍니다.',
    '직원들이 쓰레기통 비우고 먼지 닦는 시간에, **자기 본래 업무에 집중**하게 해주세요.',
    '번거로운 청소는 {업체명}이 대신 치워 드립니다. 사장님은 오직 **사업을 키우는 일**에만 집중하세요.',
  ],
  investmentPull: '번거로운 청소는 맡기고,\n일에만 집중하세요.',
  principlesTitle: '{업체명}의 3원칙',
  principles: [
    { title: '매일 똑같이, 빠짐없이 꼼꼼하게', desc: '눈에 띄는 로비·바닥만 닦고 끝내지 않습니다. 환풍구 먼지, 책상 밑 구석, 위생이 중요한 곳까지 — 체크리스트로 하나하나 확인하며 늘 같은 퀄리티로 관리합니다.' },
    { title: '보이는 곳뿐 아니라 안전까지', desc: '사람이 머무는 공간의 안전을 먼저 생각합니다. 교차 오염 방지를 위한 구역별 도구 분리, 호흡기와 직결되는 공기 순환 구역 집중 케어.' },
    { title: "매일 '새것처럼' 되돌려 놓습니다", desc: '단순히 얼룩만 지우는 게 아닙니다. 공간을 처음처럼 깨끗하게 되돌려서, 다음 날 기분 좋게 하루를 시작할 수 있게 만듭니다.' },
  ],
  refundBadge: '🔥 {업체명}의 약속',
  refundTitle: '불만족 시, 100% 환불해 드립니다',
  refundLead: '가벼운 영업 멘트가 아닙니다. 결과물에 대한 스스로의 **엄격한 원칙**이자, 파트너로서의 **무거운 책임감**입니다.',
  refundCards: [
    { title: '왜 이렇게까지 하나요?', desc: "'이 정도면 됐지' 하고 대충 넘어가지 않기 위해서입니다. 고객님이 만족 못 하시면, 저희가 들인 시간과 노력이 전부 사라지니까요." },
    { title: "'만족'의 기준", desc: '주관적 눈대중이 아닙니다. 작업 후 고객님과 함께 체크리스트 기반 교차 검증을 진행합니다.' },
    { title: '멈추지 않는 작업', desc: '현장에서 고객님의 최종 확인이 떨어질 때까지, 작업은 결코 멈추지 않습니다.' },
  ],
  refundPromise: '고객님이 완벽하게 만족하실 때까지, 저희의 작업은 멈추지 않습니다.',
  processTitle: '정기 관리 진행 프로세스',
  processSideTitle: "왜 무조건\n'방문 견적'을\n고집할까요?",
  processSideLines: [
    '평수가 같아도 **업종·바닥재·동선**에 따라 집중 케어할 구역이 완전히 다릅니다.',
    '눈으로 직접 보지 않고 낸 견적은 결국 현장에서 **퀄리티의 타협**으로 이어집니다.',
    '그래서 저희는 전화로 가격을 던지지 않습니다.',
  ],
  process: [
    { title: '문의 접수', desc: "'무료 견적 문의' 폼 작성 또는 직접 연락." },
    { title: '현장 방문 · 상담 (무료)', desc: '담당자가 직접 방문해 공간 상태를 진단하고, 대표님의 집중 관리 포인트를 청취합니다.' },
    { title: '맞춤 견적 & 체크리스트', desc: '공간에 딱 맞는 관리 주기와 비용을 제안하고, 그 공간만의 전용 체크리스트를 만듭니다.' },
    { title: '정기 관리 시작', desc: '정해진 매뉴얼대로 꼼꼼한 정기 청소를 시작합니다.' },
  ],
  trustTitle: '믿고 맡기셔도 되는 이유',
  trustLead: "청소는 '한 번 잘하기'보다 **'매번 똑같이 잘하기'**가 훨씬 어렵습니다. 저희는 그 어려운 일을, 시스템으로 지켜 온 팀입니다.",
  defaultTrustCards: [
    { emoji: '📍', title: '권역별 고정팀', desc: '매번 같은 담당이 옵니다. 사람이 바뀌면 퀄리티가 바뀌니까요.' },
    { emoji: '🔍', title: '자체 퀄리티 검수', desc: '고객님이 찾기 전에, 저희가 먼저 찾아 다시 합니다.' },
    { emoji: '🤝', title: '솔직한 견적', desc: '안 되는 걸 된다고 하지 않습니다. 못 할 것 같으면 미리 말씀드립니다.' },
    { emoji: '🧰', title: '전문 장비', desc: '보이는 먼지가 아니라, 눈에 안 보이는 미세먼지까지 관리합니다.' },
  ],
  ctaTitle: '무료 방문 견적을 받아보세요',
  ctaLead: '단순한 청소 업체를 넘어, 사장님 사업이 잘 되도록 돕는 가장 든든한 파트너가 되겠습니다. 빠른 상담을 위해 **아래 3가지**만 알려주세요.',
  prepPills: [
    { title: '① 업종 · 공간 형태', desc: '치과, 입시학원, IT 사무실, 상가 등' },
    { title: '② 대략적인 평수', desc: '예: 약 40평' },
    { title: '③ 원하시는 서비스', desc: '주 2회 정기 / 인테리어 대청소 등' },
  ],
}
