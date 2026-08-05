// 초도 진단·보고 리포트에서 공용으로 쓰는 항목 타입·라벨 (에디터·서버액션·공개 페이지 공유)

// 문제를 어떻게 처리하는지 — 정기청소 범위 / 무상 서비스 / 별도 유상작업
export type ResolutionKind = 'regular' | 'service' | 'paid'
// 작업 후 결과 — 미정 / 해결 / 부분해결·재발가능 / 유상 권장
export type ResultKind = '' | 'resolved' | 'partial' | 'paid_recommend'

export interface OnboardingItem {
  id: string
  space: string // 구역(예: 주방, 화장실, 로비 바닥)
  problem: string // 현재 상태·문제
  resolution: ResolutionKind
  beforeUrl: string | null
  afterUrl: string | null
  result: ResultKind
  nextAction: string // 다음에 이렇게 하면 좋겠다는 제안(선택)
}

export const RESOLUTION_LABEL: Record<ResolutionKind, string> = {
  regular: '정기청소로 해결',
  service: '서비스로 처리',
  paid: '별도 유상작업 필요',
}

export const RESULT_LABEL: Record<Exclude<ResultKind, ''>, string> = {
  resolved: '해결됐어요',
  partial: '부분 해결 · 재발 가능',
  paid_recommend: '유상 작업 권장',
}

export function newOnboardingItem(): OnboardingItem {
  return {
    id: Math.random().toString(36).slice(2),
    space: '',
    problem: '',
    resolution: 'regular',
    beforeUrl: null,
    afterUrl: null,
    result: '',
    nextAction: '',
  }
}
