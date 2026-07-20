import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 에어컨 관련 오타·변형 감지
// 예: 에어켄, 애어컨, 에어컨, 에어콘, 에어컨청소 등
const AC_VARIANTS = /에어[컨켠켄콘]|애어[컨켠켄콘]/

export function isAcService(name: string): boolean {
  return AC_VARIANTS.test(name)
}

// ── 유형·대수(변형)로 견적 내는 가전 청소 프리셋 ──
// 서비스명에 키워드가 들어가면 등록/수정/고객 견적에서 "유형별 단가 + 대수 선택" UI가 자동으로 뜬다.
// 냉장고·세탁기 등 새 가전은 여기 한 항목만 추가하면 전체 흐름이 동작한다(에어컨과 동일 파이프라인 재사용).
export interface ApplianceType {
  id: string          // ac_type_prices JSON 키 (전역 유일해야 함)
  label: string
  sub: string         // 부가 설명 (없으면 빈 문자열)
  defaultPrice: number // 제안 기본 단가 (사장님이 수정 가능)
}
export interface AppliancePreset {
  key: string         // 프리셋 식별자
  noun: string        // 고객 문구용 명사 (예: "에어컨", "냉장고")
  match: RegExp       // 서비스명 감지 패턴
  types: ApplianceType[]
}

export const APPLIANCE_PRESETS: AppliancePreset[] = [
  {
    key: 'ac',
    noun: '에어컨',
    match: AC_VARIANTS,
    types: [
      { id: 'wall_standard',  label: '벽걸이형',     sub: '일반',        defaultPrice: 75000 },
      { id: 'wall_baramless', label: '벽걸이형',     sub: '무풍',        defaultPrice: 95000 },
      { id: 'stand_standard', label: '스탠드형',     sub: '일반',        defaultPrice: 100000 },
      { id: 'stand_smart',    label: '스탠드형',     sub: '스마트·무풍',  defaultPrice: 125000 },
      { id: 'system_1way',    label: '시스템에어컨', sub: '1way·2way',   defaultPrice: 110000 },
      { id: 'system_4way',    label: '시스템에어컨', sub: '4way',        defaultPrice: 130000 },
      { id: 'commercial',     label: '업소형',       sub: '',           defaultPrice: 150000 },
    ],
  },
  {
    key: 'fridge',
    noun: '냉장고',
    match: /냉장고/,
    types: [
      { id: 'fridge_normal',     label: '일반 냉장고', sub: '1~2도어',       defaultPrice: 70000 },
      { id: 'fridge_sidebyside', label: '양문형',     sub: '4도어',         defaultPrice: 90000 },
      { id: 'fridge_kimchi',     label: '김치냉장고',  sub: '스탠드/뚜껑형',  defaultPrice: 80000 },
      { id: 'fridge_commercial', label: '업소용',     sub: '워크인·쇼케이스', defaultPrice: 120000 },
    ],
  },
  {
    key: 'washer',
    noun: '세탁기',
    match: /세탁기/,
    types: [
      { id: 'washer_toploader', label: '통돌이 세탁기', sub: '일반',        defaultPrice: 60000 },
      { id: 'washer_drum',      label: '드럼 세탁기',   sub: '',           defaultPrice: 80000 },
      { id: 'washer_mini',      label: '미니 세탁기',   sub: '벽걸이·아기옷', defaultPrice: 50000 },
    ],
  },
]

// 서비스명으로 가전 프리셋을 찾는다. 여러 개가 매칭되면 첫 번째(등록 순).
export function getAppliancePreset(name: string): AppliancePreset | null {
  if (!name) return null
  return APPLIANCE_PRESETS.find((p) => p.match.test(name)) ?? null
}
export function getApplianceTypes(name: string): ApplianceType[] | null {
  return getAppliancePreset(name)?.types ?? null
}
// 유형·대수 선택이 필요한 가전 서비스인지 (에어컨·냉장고 등 전부 포함)
export function isApplianceService(name: string): boolean {
  return getAppliancePreset(name) != null
}
