// 첫 이용 온보딩 체크리스트 — DB 상태(개수)를 읽어 각 단계 완료 여부를 자동 판정한다.
// UI에 고정된 가이드 투어와 달리, 데이터 기반이라 화면이 바뀌어도 정확함이 유지된다.

export interface OnboardingCounts {
  serviceItems: number
  hasPublicPage: boolean   // AI 홍보 페이지(GEO) 생성 완료 여부
  hasBundles: boolean      // 서비스 플랜(기본/추천/프리미엄) 항목 구성 여부
  hasReviewUrl: boolean    // 네이버/구글 플레이스 등 리뷰 받을 곳 연결 여부
  quotes: number
  bookings: number
  completedBookings: number
}

export interface OnboardingStep {
  key: string
  label: string
  description: string
  href: string
  cta: string
  done: boolean
}

// 핵심 매출 흐름(서비스 등록 → 견적 → 예약 → 완료) 순서대로 단계를 구성한다.
export function buildOnboardingSteps(c: OnboardingCounts): OnboardingStep[] {
  return [
    {
      key: 'business',
      label: '업체 정보 등록',
      description: '가입할 때 입력을 마쳤어요',
      href: '/dashboard/settings',
      cta: '정보 수정하기',
      done: true, // 온보딩을 통과해야 대시보드에 진입하므로 항상 완료
    },
    {
      key: 'service',
      label: '서비스 항목 등록하기',
      description: '청소 종류와 가격을 먼저 등록해요',
      href: '/dashboard/services',
      cta: '서비스 등록하기',
      done: c.serviceItems > 0,
    },
    {
      key: 'tier',
      label: '플랜(번들) 구성하기',
      description: '각 서비스의 기본·추천·프리미엄 항목을 정해요 (AI 추천 가능)',
      href: '/dashboard/services',
      cta: '플랜 구성하기',
      done: c.hasBundles,
    },
    {
      key: 'geo',
      label: 'AI 홍보 페이지 만들기',
      description: '등록한 서비스로 검색·AI 추천에 노출되는 페이지를 자동으로 만들어요',
      href: '/dashboard/settings',
      cta: '홍보 페이지 만들기',
      done: c.hasPublicPage,
    },
    {
      key: 'review_url',
      label: '리뷰 받을 곳 연결하기',
      description: '네이버·구글 주소를 연결하면 작업 끝난 고객에게 리뷰 요청이 자동으로 가고, AI 검색에도 같은 업체로 잡혀요',
      href: '/dashboard/settings',
      cta: '주소 연결하기',
      done: c.hasReviewUrl,
    },
    {
      key: 'quote',
      label: '첫 견적 보내기',
      description: '고객에게 견적 링크를 보내보세요',
      href: '/dashboard/quotes',
      cta: '견적 만들기',
      done: c.quotes > 0,
    },
    {
      key: 'booking',
      label: '첫 예약 받기',
      description: '고객이 예약하면 여기에 쌓여요',
      href: '/dashboard/schedule',
      cta: '예약 보기',
      done: c.bookings > 0,
    },
    {
      key: 'complete',
      label: '첫 작업 완료하고 보고서 보내기',
      description: '작업이 끝나면 사진 보고서를 보내요',
      href: '/dashboard/schedule',
      cta: '예약 보기',
      done: c.completedBookings > 0,
    },
  ]
}

export interface OnboardingProgress {
  done: number
  total: number
  allDone: boolean
  // 다음에 해야 할(아직 안 끝난 첫) 단계
  nextStep: OnboardingStep | null
}

export function onboardingProgress(steps: OnboardingStep[]): OnboardingProgress {
  const done = steps.filter((s) => s.done).length
  const nextStep = steps.find((s) => !s.done) ?? null
  return { done, total: steps.length, allDone: done === steps.length, nextStep }
}
