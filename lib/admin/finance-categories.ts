// 본사 재무 분류 체계 — 매각 실사 대비 손익계산서 구조로 설계
//
// 왜 이렇게 나누는가:
//   SaaS 매각가는 '매출총이익률(Gross Margin)'이 좌우한다. 그걸 뽑으려면 비용을
//   매출원가(COGS: 매출에 직접 딸려오는 인프라·API 등)와 판관비(OpEx: 광고·인건비 등)로
//   처음부터 갈라 담아야 한다. 각 분류에 costType 꼬리표를 달아두면, 나중에 손익계산서
//   (매출 − COGS = 매출총이익 − 판관비 = 영업이익)가 그대로 나온다.

export type CostType = 'cogs' | 'opex'

export interface FinanceCategory {
  id: string
  label: string
  costType: CostType
  color: string // 분류별 막대/도넛 색
}

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  // 매출원가 (COGS) — 매출에 직접 연동되는 비용
  { id: 'infra', label: '인프라·호스팅', costType: 'cogs', color: '#64748b' },
  { id: 'ai_api', label: 'AI·API', costType: 'cogs', color: '#8b5cf6' },
  { id: 'messaging', label: '알림톡·문자', costType: 'cogs', color: '#f59e0b' },
  { id: 'payment_fee', label: '결제 수수료', costType: 'cogs', color: '#06b6d4' },
  // 판관비 (OpEx) — 운영비
  { id: 'marketing', label: '광고·마케팅', costType: 'opex', color: '#f43f5e' },
  { id: 'payroll', label: '인건비·급여', costType: 'opex', color: '#3b82f6' },
  { id: 'software', label: '소프트웨어·툴', costType: 'opex', color: '#10b981' },
  { id: 'tax', label: '세금·공과금', costType: 'opex', color: '#fb923c' },
  { id: 'etc', label: '기타 운영비', costType: 'opex', color: '#9ca3af' },
]

export const CATEGORY_MAP: Record<string, FinanceCategory> = Object.fromEntries(
  FINANCE_CATEGORIES.map((c) => [c.id, c]),
)

export const CATEGORY_IDS = FINANCE_CATEGORIES.map((c) => c.id)

// 구독 프리셋 — 초보자용: 이름 고르면 분류·통화 자동 추천
export interface SubscriptionPreset {
  name: string
  category: string
  currency: 'KRW' | 'USD'
}

export const SUBSCRIPTION_PRESETS: SubscriptionPreset[] = [
  { name: 'Claude API', category: 'ai_api', currency: 'USD' },
  { name: 'OpenAI (ChatGPT)', category: 'ai_api', currency: 'USD' },
  { name: 'Gemini', category: 'ai_api', currency: 'USD' },
  { name: 'Perplexity', category: 'ai_api', currency: 'USD' },
  { name: 'Vercel', category: 'infra', currency: 'USD' },
  { name: 'Supabase', category: 'infra', currency: 'USD' },
  { name: 'Solapi 알림톡', category: 'messaging', currency: 'KRW' },
  { name: 'Google Workspace', category: 'software', currency: 'USD' },
  { name: '노션(Notion)', category: 'software', currency: 'USD' },
  { name: '가비아 도메인', category: 'software', currency: 'KRW' },
  { name: 'Meta 광고', category: 'marketing', currency: 'KRW' },
  { name: '네이버 광고', category: 'marketing', currency: 'KRW' },
]
