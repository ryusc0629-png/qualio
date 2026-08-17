// 소개서(제안서) 표준문구 엔진.
// 원칙: 업체마다 다른 값(업체명·로고·색·강점·시공사례)은 businesses에서 자동으로 끌어오고,
// 반복되는 설득 카피는 여기 표준문구로 고정한다(시방서 spec-sheet 패턴).
// 업체명은 {업체명} 토큰으로 치환한다.

export type ProposalCategory = 'general' | 'hospital' | 'office' | 'store' | 'interior'
export type ProposalThemeId = 'brand' | 'emerald' | 'gold' | 'slate'
// 디자인 템플릿 — 같은 내용을 다른 레이아웃/무게감으로 인쇄한다
export type ProposalDesignId = 'classic' | 'photo' | 'clean' | 'bold'

// 소개서 전용 저장값(businesses.proposal_settings) — 소수 입력만 담는다
export interface ProposalStat {
  value: string // 예: '3'
  unit: string  // 예: '년'
  label: string // 예: '정기청소를 운영해 온 시간'
}

// 소개서에서 쓸 사진 — 비우면 홈페이지 사진(시공사례·대표사진)을 자동으로 쓴다
export interface ProposalPhotos {
  cover?: string      // 표지
  investment?: string // '청소는 투자입니다' 페이지
  category?: string   // '이런 공간을 관리합니다' 페이지
  owner?: string      // 대표 인사말(비면 홈페이지 대표 사진)
  gallery?: string[]  // 작업 포트폴리오 페이지(비면 홈페이지 사진에서 자동)
}

export interface ProposalSettings {
  template?: string
  design?: ProposalDesignId
  category?: ProposalCategory
  theme?: ProposalThemeId
  headline?: string // 표지 큰 강조 문구(비면 업체 소개로 대체)
  kicker?: string   // 표지 상단 한 줄(지역·포지셔닝). 비면 카테고리 기본값
  stats?: ProposalStat[]
  photos?: ProposalPhotos
  // 옛 저장분에는 뒤에 추가된 항목이 없으므로 일부만 담길 수 있다(빌드에서 기본값과 병합)
  sections?: Partial<ProposalSectionToggles>
}

export interface ProposalSectionToggles {
  owner: boolean      // 대표 인사말(홈페이지 값)
  pain: boolean       // 지금 겪는 불편(결핍) → 우리가 어떻게 없애는지
  investment: boolean
  services: boolean   // 제공 서비스(견적 항목)
  principles: boolean
  gallery: boolean    // 시공 사례 비포·애프터
  refund: boolean
  process: boolean
  reviews: boolean    // 고객 후기(실제 후기만)
  trust: boolean
}

export const DEFAULT_SECTIONS: ProposalSectionToggles = {
  owner: true,
  pain: true,
  investment: true,
  services: true,
  principles: true,
  gallery: true,
  refund: true,
  process: true,
  reviews: true,
  trust: true,
}

// ── 디자인 템플릿 ───────────────────────────────────────────
export interface ProposalDesignDef {
  id: ProposalDesignId
  name: string
  desc: string // 사장님용 한 줄 설명(무슨 느낌인지)
}

export const PROPOSAL_DESIGNS: ProposalDesignDef[] = [
  { id: 'classic', name: '기본 (정갈한 문서)', desc: '왼쪽에 옅은 색 띠. 어디에 내도 무난한 기본형' },
  { id: 'photo', name: '사진 강조', desc: '표지를 사진으로 꽉 채워 현장 느낌을 살림' },
  { id: 'clean', name: '깔끔한 흰색', desc: '색을 최소로 쓴 미니멀. 병원·오피스에 잘 맞음' },
  { id: 'bold', name: '눈에 띄는 강조', desc: '색과 글자를 크게. 상가·매장 영업에 강함' },
]

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

// 결핍(지금 겪는 불편) → 해소(우리는 이렇게 없앱니다). 제안서 설득의 뼈대.
export interface PainItem {
  pain: string      // 겪고 있는 문제 한 줄
  painDesc: string  // 그래서 무슨 일이 생기는지
  fix: string       // 우리가 없애는 방식 한 줄
  fixDesc: string   // 어떻게 하는지
}

export interface ProposalCategoryDef {
  id: ProposalCategory
  name: string           // 선택 UI용
  kicker: string         // 표지 상단 기본 문구
  sideTitle: string      // '대상 공간' 섹션 사이드 제목
  sideLines: string[]    // 사이드 설명(강조는 **로 감싸 굵게)
  cards: SpaceCard[]      // 관리 대상 공간 카드
  pains: PainItem[]       // 결핍 → 해소 (공간마다 겪는 불편이 다름)
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
    pains: [
      {
        pain: '사람이 바뀔 때마다 상태가 달라진다',
        painDesc: '지난주는 깨끗했는데 이번 주는 대충 한 티가 납니다.',
        fix: '담당을 고정합니다',
        fixDesc: '같은 담당이 오니 그 공간의 취약 구역을 기억하고, 매번 같은 기준으로 관리합니다.',
      },
      {
        pain: '눈에 보이는 곳만 닦여 있다',
        painDesc: '바닥과 로비는 깨끗한데 책상 밑·환풍구는 몇 달째 그대로입니다.',
        fix: '안 보이는 구역까지 목록에 넣습니다',
        fixDesc: '그 공간 전용 체크리스트로 매번 같은 순서로 확인해, 빠지는 곳을 없앱니다.',
      },
      {
        pain: '전화로 받은 견적이 현장에서 바뀐다',
        painDesc: '막상 작업 날이 되면 추가금 이야기가 나옵니다.',
        fix: '직접 보고 정한 금액 그대로 갑니다',
        fixDesc: '무료 방문 견적으로 공간을 확인한 뒤 금액을 확정하고, 안 되는 일은 미리 말씀드립니다.',
      },
      {
        pain: '문제를 말해도 그때 한 번뿐이다',
        painDesc: '요청한 곳만 그날 하고, 다음 주면 다시 원래대로 돌아옵니다.',
        fix: '한 번 하신 말씀은 계속 남습니다',
        fixDesc: '요청은 체크리스트에 넣어 매번 반복하고, 만족하실 때까지 다시 작업합니다.',
      },
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
    pains: [
      {
        pain: '병원 기준을 모르는 채로 청소한다',
        painDesc: '상가 청소하듯 도구 하나로 진료실까지 들어갑니다. 교차 오염이 걱정될 수밖에 없습니다.',
        fix: '구역별로 도구를 나눠 씁니다',
        fixDesc: '진료·처치·대기 구역의 도구와 동선을 분리하고, 소독 순서를 정해 두고 지킵니다.',
      },
      {
        pain: '환자가 있는 시간에 청소가 겹친다',
        painDesc: '대기 환자 앞에서 걸레질을 하면, 청결을 위한 일이 오히려 병원 이미지를 깎습니다.',
        fix: '진료 시간표에 맞춰 들어갑니다',
        fixDesc: '진료 전·후 시간대로 일정을 잡아 환자 동선과 겹치지 않게 작업합니다.',
      },
      {
        pain: '정작 손이 닿는 곳이 빠져 있다',
        painDesc: '손잡이·접수대·카드 단말기처럼 하루에 수십 번 만지는 곳은 늘 그대로입니다.',
        fix: '접점 표면을 고정 목록에 넣습니다',
        fixDesc: '매 방문 체크리스트에 넣어 반복 소독하고, 빠뜨렸는지 눈으로 확인합니다.',
      },
      {
        pain: '담당이 계속 바뀌어 매번 다시 설명한다',
        painDesc: '원장님이 말씀하신 요청은 그 사람이 그만두면 같이 사라집니다.',
        fix: '담당 고정 + 요청은 기록으로 남깁니다',
        fixDesc: '한 번 말씀하신 내용이 체크리스트에 남아, 사람이 바뀌어도 다음 방문에 그대로 반영됩니다.',
      },
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
    pains: [
      {
        pain: '직원들이 청소를 나눠 맡고 있다',
        painDesc: '쓰레기통 비우기·탕비실 정리에 매일 업무 시간이 조금씩 샙니다. 서로 눈치도 봅니다.',
        fix: '그 일을 통째로 가져갑니다',
        fixDesc: '정해진 주기로 들어와 직원 손이 안 가게 정리합니다. 직원은 자기 일만 하면 됩니다.',
      },
      {
        pain: '눈에 보이는 곳만 닦여 있다',
        painDesc: '책상 밑, 모니터 뒤, 환풍구 먼지는 몇 달째 그대로 쌓입니다.',
        fix: '안 보이는 구역까지 목록에 넣습니다',
        fixDesc: '사무실 전용 체크리스트로 매번 같은 순서로 확인해, 빠지는 곳을 없앱니다.',
      },
      {
        pain: '손님 오는 날만 급하게 치운다',
        painDesc: '미팅 전날이면 직원들이 붙어서 로비와 회의실을 정리합니다.',
        fix: '늘 손님 맞을 수 있는 상태로 둡니다',
        fixDesc: '로비·회의실을 기본 관리 구역으로 잡아, 갑작스러운 방문에도 준비가 되어 있습니다.',
      },
      {
        pain: '사람이 바뀌면 퀄리티가 바뀐다',
        painDesc: '지난주와 이번 주가 다르니, 결국 사장님이 매번 확인해야 합니다.',
        fix: '담당을 고정합니다',
        fixDesc: '같은 담당이 오니 취약 구역을 기억하고, 사장님이 확인하지 않아도 상태가 유지됩니다.',
      },
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
    pains: [
      {
        pain: '첫인상에서 손님을 놓친다',
        painDesc: '입구 유리 얼룩과 바닥 자국은, 사장님보다 손님이 먼저 봅니다.',
        fix: '손님 눈에 닿는 순서대로 관리합니다',
        fixDesc: '입구·유리·바닥을 우선 구역으로 잡아, 매장 첫인상부터 정리합니다.',
      },
      {
        pain: '화장실 냄새가 끝내 안 잡힌다',
        painDesc: '청소는 하는데 냄새가 남습니다. 손님은 그걸로 매장 전체를 평가합니다.',
        fix: '냄새가 나는 지점을 잡습니다',
        fixDesc: '물때·배수구처럼 원인이 되는 곳을 정해 두고 반복 관리합니다.',
      },
      {
        pain: '영업시간에 청소가 겹친다',
        painDesc: '손님 앞에서 걸레질을 하게 되고, 결국 매출 시간대를 깎아먹습니다.',
        fix: '영업 전·후 시간에 들어갑니다',
        fixDesc: '매장 일정에 맞춰 시간을 정하고, 손님이 있는 시간은 피합니다.',
      },
      {
        pain: '바쁜 날이 지나면 매장이 무너진다',
        painDesc: '주말이 지나면 상태가 확 떨어지는데, 사장님이 챙길 여유는 없습니다.',
        fix: '정해진 주기로 무조건 들어옵니다',
        fixDesc: '사장님이 신경 쓰지 않아도 같은 상태로 되돌려 놓습니다.',
      },
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
    pains: [
      {
        pain: '마감 인력이 대충 쓸고 끝낸다',
        painDesc: '보이는 것만 치워 놓으니, 입주하고 나서 먼지가 계속 올라옵니다.',
        fix: '숨은 먼지를 장비로 뽑아냅니다',
        fixDesc: '몰딩·틈새·수납장 안쪽까지 흡진한 뒤 마무리해, 입주 후 먼지를 줄입니다.',
      },
      {
        pain: '새 마감재가 상해서 돌아온다',
        painDesc: '잘못된 세제와 수세미 때문에 유리·금속·목재에 흠집이 남습니다.',
        fix: '소재별로 약품과 도구를 나눕니다',
        fixDesc: '마감재에 맞는 전용 세정으로, 새 자재를 상하지 않게 되살립니다.',
      },
      {
        pain: '청소가 늦어져 오픈 일정이 흔들린다',
        painDesc: '공정이 밀리면 청소부터 밀리고, 결국 입주 날짜가 흔들립니다.',
        fix: '공정에 맞춰 인원을 넣습니다',
        fixDesc: '마감 일정을 먼저 확인하고 인원·시간 계획을 잡아 날짜를 맞춥니다.',
      },
      {
        pain: '다 됐다더니 하자가 남아 있다',
        painDesc: '입주하고 나서야 스티커 자국·본드 자국이 눈에 들어옵니다.',
        fix: '확인을 받고 철수합니다',
        fixDesc: '구역별 체크리스트로 다시 점검하고, 고객님 최종 확인까지 받은 뒤 마칩니다.',
      },
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
  // 결핍 → 해소
  painTitle: string
  painLead: string
  painNowLabel: string
  painFixLabel: string
  painFootTag: string
  // 홈페이지 값으로 채우는 페이지들
  ownerTitle: string
  ownerSideTitle: string
  ownerFallbackGreeting: string
  servicesTitle: string
  servicesSideTitle: string
  servicesSideLines: string[]
  servicesFootTag: string
  galleryTitle: string
  galleryLead: string
  galleryFootTag: string
  reviewsTitle: string
  reviewsLead: string
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
  painTitle: '이런 일, 겪어보셨을 겁니다',
  painLead:
    '청소를 안 해서 생기는 문제는 거의 없습니다. **매번 같지 않아서** 생깁니다. 아래는 대표님들이 실제로 겪는 일들과, {업체명}이 그 일을 없애는 방식입니다.',
  painNowLabel: '지금 겪는 일',
  painFixLabel: '{업체명}은 이렇게 합니다',
  painFootTag: '문제를 아는 곳에 맡기면, **사장님이 신경 쓸 일이 줄어듭니다**.',
  ownerTitle: '대표가 직접 인사드립니다',
  ownerSideTitle: '결국\n사람을\n믿고 맡깁니다',
  ownerFallbackGreeting:
    '{업체명}을 맡고 있습니다. 현장에 직접 나가고, 마무리까지 제 눈으로 확인합니다. 맡겨 주신 공간을 제 사업장처럼 관리하겠습니다.',
  servicesTitle: '제공하는 서비스',
  servicesSideTitle: '필요한 만큼만\n골라\n맡기세요',
  servicesSideLines: [
    '정기 관리부터 1회성 대청소까지, **필요한 항목만** 고르실 수 있습니다.',
    '공간 상태를 직접 보고 **꼭 필요한 작업**만 제안드립니다.',
    '없는 항목도 상담해 주시면 가능한지 솔직하게 알려드립니다.',
  ],
  servicesFootTag: '가격은 공간을 직접 보고 **정확하게** 말씀드립니다.',
  galleryTitle: '작업 포트폴리오',
  galleryLead: '말보다 사진이 정확합니다. 실제로 저희가 다녀온 현장입니다.',
  galleryFootTag: '사진은 모두 **직접 작업한 현장**입니다.',
  reviewsTitle: '고객이 남긴 후기',
  reviewsLead: '저희가 쓴 문구가 아니라, 실제 맡겨 보신 고객이 남긴 평가입니다.',
}
