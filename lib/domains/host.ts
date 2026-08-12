// 호스트(도메인) 판별·정규화 유틸
//
// 커스텀 도메인 라우팅은 "지금 들어온 요청의 호스트가 퀄리오 것인가, 고객사 것인가"를
// 가르는 데서 시작한다. 이 판단은 proxy(모든 요청)에서 매번 돌기 때문에 DB를 보지 않고
// 문자열만으로 끝낸다.

// 퀄리오 서비스 자체의 호스트 — 여기로 들어오면 평소대로 동작한다
const PLATFORM_SUFFIXES = ['.vercel.app', '.localhost']

/** 'https://www.Example.co.kr/path' → 'www.example.co.kr' (실패하면 null) */
export function normalizeDomain(input: string): string | null {
  let v = input.trim().toLowerCase()
  if (!v) return null

  // 프로토콜·경로·쿼리·포트 제거 — 사장님이 주소창에서 통째로 복사해 붙여넣는 경우가 흔하다
  v = v.replace(/^https?:\/\//, '')
  v = v.split('/')[0]
  v = v.split('?')[0]
  v = v.split(':')[0]
  v = v.replace(/\.$/, '') // 끝의 점(루트 라벨) 제거

  // 라벨 검증 — 한글 도메인(퓨니코드 아님)은 받지 않는다
  const ok = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(v)
  if (!ok) return null
  if (v.length > 253) return null

  return v
}

/** 퀄리오 서비스 도메인인가 (= 고객사 커스텀 도메인이 아님) */
export function isPlatformHost(host: string | null | undefined): boolean {
  if (!host) return true
  const h = host.toLowerCase().split(':')[0]

  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true
  if (PLATFORM_SUFFIXES.some((s) => h.endsWith(s))) return true

  // NEXT_PUBLIC_APP_URL 의 호스트와 그 www 변형
  const appHost = getAppHost()
  if (h === appHost || h === `www.${appHost}`) return true

  return false
}

/** NEXT_PUBLIC_APP_URL 의 호스트만 ('qualio.co.kr') */
export function getAppHost(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  try {
    return new URL(raw).host.toLowerCase()
  } catch {
    return 'qualio.co.kr'
  }
}

/** 'www.' 를 뗀 형태 — apex/www 를 같은 업체로 취급하기 위한 키 */
export function stripWww(host: string): string {
  return host.replace(/^www\./, '')
}

/** apex 도메인인가 (www 없는 2단계 이상) — DNS 안내 문구를 A/CNAME 중 무엇으로 보여줄지 결정 */
export function isApexDomain(host: string): boolean {
  const labels = stripWww(host).split('.')
  // 'bkclean.co.kr' → 3라벨이지만 apex. 국가 2단계 도메인(co.kr, or.kr 등)을 감안한다
  const twoLevelTlds = ['co.kr', 'or.kr', 'ne.kr', 'pe.kr', 'go.kr', 're.kr', 'com.au', 'co.jp', 'co.uk']
  const last2 = labels.slice(-2).join('.')
  const isTwoLevel = twoLevelTlds.includes(last2)
  return labels.length === (isTwoLevel ? 3 : 2) && !host.startsWith('www.')
}
