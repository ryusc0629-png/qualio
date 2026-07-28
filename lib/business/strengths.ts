import {
  ShieldCheck,
  Shield,
  ClipboardCheck,
  Users,
  Award,
  RefreshCw,
  Leaf,
  Wrench,
  Zap,
  BadgeCheck,
  FileText,
  GraduationCap,
  MessageCircle,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'

// 업체별 강점(특장점) 1개 — 홈페이지 "○○만의 차이" 카드로 노출
export interface Strength {
  key: string // 프리셋 id 또는 'custom' (아이콘 매핑용)
  title: string
  desc: string
}

// 사장님이 탭 한 번으로 켜는 강점 팔레트 — 청소업 현장에서 자주 쓰는 항목들.
// 켜면 아래 기본 문구가 들어가고, 문구는 그대로 수정할 수 있음(예: 경력 연차).
export const STRENGTH_PRESETS: Strength[] = [
  { key: 'refund',     title: '100% 환불보장',     desc: '만족스럽지 않으시면 100% 환불해 드려요' },
  { key: 'insurance',  title: '배상책임보험 가입',  desc: '혹시 모를 파손도 보험으로 보상해 드려요' },
  { key: 'inspection', title: '검수팀 별도 운영',   desc: '작업이 끝나면 검수팀이 한 번 더 꼼꼼히 확인해요' },
  { key: 'fixed_team', title: '고정팀제 운영',      desc: '늘 같은 팀이 방문해 믿고 맡기실 수 있어요' },
  { key: 'career',     title: '경력 10년 이상',     desc: '오랜 경력의 전문 청소팀이 직접 작업해요' },
  { key: 'as',         title: '재작업 A/S',        desc: '미흡한 부분은 다시 방문해 끝까지 마무리해 드려요' },
  { key: 'eco',        title: '친환경 세제 사용',   desc: '아이·반려동물에게도 안전한 세제만 써요' },
  { key: 'equipment',  title: '전문 장비 보유',     desc: '전문 장비로 손이 닿기 어려운 곳까지 청소해요' },
  { key: 'same_day',   title: '당일·긴급 방문',     desc: '급하실 때 빠르게 방문 일정을 잡아드려요' },
  { key: 'free_visit', title: '무료 방문견적',      desc: '방문해서 정확한 견적을 무료로 내드려요' },
  { key: 'receipt',    title: '세금계산서 발행',    desc: '사업자 거래도 세금계산서를 발행해 드려요' },
  { key: 'certified',  title: '자격증 보유팀',      desc: '청소 관련 자격을 갖춘 전문가가 작업해요' },
]

// 강점을 하나도 안 켠 업체용 기본 카드(기존 하드코딩 문구 유지 — 하위 호환)
export const DEFAULT_STRENGTHS: Strength[] = [
  { key: 'instant',  title: '즉시 견적 확인', desc: '복잡한 상담 없이 서비스 정보 입력 후 3가지 맞춤 견적을 바로 확인할 수 있어요.' },
  { key: 'pro_team', title: '전문 청소팀',    desc: '체계적인 교육을 받은 전문 청소 인력이 꼼꼼하게 작업해요. 믿고 맡길 수 있어요.' },
  { key: 'kakao',    title: '카카오 알림톡',  desc: '예약 확정부터 방문 전 안내까지 카카오톡으로 자동 알림을 드려요.' },
]

// 강점 key → 아이콘 매핑 (홈페이지·설정 화면 공용). 모르는 key는 체크 아이콘으로 폴백.
const ICON_MAP: Record<string, LucideIcon> = {
  refund: ShieldCheck,
  insurance: Shield,
  inspection: ClipboardCheck,
  fixed_team: Users,
  career: Award,
  as: RefreshCw,
  eco: Leaf,
  equipment: Wrench,
  same_day: Zap,
  free_visit: BadgeCheck,
  receipt: FileText,
  certified: GraduationCap,
  // 기본 카드용
  instant: Zap,
  pro_team: Shield,
  kakao: MessageCircle,
}

export function getStrengthIcon(key: string): LucideIcon {
  return ICON_MAP[key] ?? CheckCircle2
}

export const MAX_STRENGTHS = 6
