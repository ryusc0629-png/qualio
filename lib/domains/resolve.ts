// 공개 홈페이지(/biz/...)가 'slug로 들어왔는지, 고객사 도메인으로 들어왔는지'를 다루는 유틸.
//
// proxy가 고객사 도메인 요청을 /biz/{도메인}/... 으로 rewrite하기 때문에,
// [slug] 자리에는 slug('다트클린-a1b2')가 올 수도 있고 도메인('dartclean.co.kr')이 올 수도 있다.
// 도메인에는 점이 있고 slug에는 없다는 점으로 구분한다.

export interface BizDomainFields {
  slug: string | null
  custom_domain: string | null
  custom_domain_status: string | null
}

/** [slug] 자리에 들어온 값이 고객사 도메인인가 */
export function isDomainIdentifier(identifier: string): boolean {
  return identifier.includes('.')
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
}

/**
 * 이 업체 홈페이지의 정식 주소(끝에 / 없음).
 * 고객사 도메인이 살아 있으면 그쪽이 정식 주소다 — canonical·JSON-LD·사이트맵이 모두 이 값을 쓴다.
 * 같은 내용이 두 주소로 열려 검색엔진이 둘을 따로 세는 일(중복 색인)을 막는 핵심.
 */
export function bizBaseUrl(b: BizDomainFields): string {
  if (b.custom_domain && b.custom_domain_status === 'active') {
    return `https://${b.custom_domain}`
  }
  return `${getAppUrl()}/biz/${b.slug}`
}

/** 고객사 도메인이 실제로 서비스 중인가 */
export function hasLiveCustomDomain(b: BizDomainFields): boolean {
  return !!b.custom_domain && b.custom_domain_status === 'active'
}
