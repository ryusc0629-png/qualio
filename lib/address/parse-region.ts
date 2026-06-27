// 한국 주소 문자열에서 행정구역 위계(시/도 → 시·군·구 → 읍·면·동)를 파싱한다.
// 지오코딩 API 없이 주소 텍스트만으로 areaServed "지역 사다리"를 구성하기 위한 순수 함수.
// — 좁은 지역(동/구)에 집중하되 상위 지역(시·도·권역)도 함께 노출해 AI 검색 매칭을 넓힌다.

export interface RegionParts {
  sido: string | null // 시/도 표준명 (예: 서울특별시, 경기도)
  si: string | null // 시 (도 소속, 예: 수원시) — 광역시·특별시면 null
  gu: string | null // 자치구·일반구 (예: 강남구, 영통구)
  gun: string | null // 군 (예: 울주군)
  dong: string | null // 읍·면·동 (예: 역삼동)
  region: string | null // 권역 (예: 수도권)
  primaryLocal: string | null // 사장님에게 보여줄 대표 지역명 (구 > 군 > 시 > 시/도)
  ladder: string[] // 좁은→넓은 순서의 지역 목록 (areaServed용, 중복 제거)
}

// 시/도 별칭 → 표준명 + 권역 매핑. 긴 별칭을 먼저 둬 부분 매칭 오류를 막는다.
// 권역(region)은 소비자가 실제로 검색하는 '수도권'만 사용. 동남권/대경권 등은
// 행정·학술 용어라 검색 매칭에 무의미해 빈 값으로 둔다(사다리에서 자동 제외됨).
const SIDO_TABLE: { aliases: string[]; full: string; region: string }[] = [
  { aliases: ['서울특별시', '서울시', '서울'], full: '서울특별시', region: '수도권' },
  { aliases: ['인천광역시', '인천시', '인천'], full: '인천광역시', region: '수도권' },
  { aliases: ['경기도', '경기'], full: '경기도', region: '수도권' },
  { aliases: ['부산광역시', '부산시', '부산'], full: '부산광역시', region: '' },
  { aliases: ['울산광역시', '울산시', '울산'], full: '울산광역시', region: '' },
  { aliases: ['경상남도', '경남'], full: '경상남도', region: '' },
  { aliases: ['대구광역시', '대구시', '대구'], full: '대구광역시', region: '' },
  { aliases: ['경상북도', '경북'], full: '경상북도', region: '' },
  { aliases: ['광주광역시', '광주시', '광주'], full: '광주광역시', region: '' },
  { aliases: ['전라남도', '전남'], full: '전라남도', region: '' },
  { aliases: ['전북특별자치도', '전라북도', '전북'], full: '전북특별자치도', region: '' },
  { aliases: ['대전광역시', '대전시', '대전'], full: '대전광역시', region: '' },
  { aliases: ['세종특별자치시', '세종시', '세종'], full: '세종특별자치시', region: '' },
  { aliases: ['충청남도', '충남'], full: '충청남도', region: '' },
  { aliases: ['충청북도', '충북'], full: '충청북도', region: '' },
  { aliases: ['강원특별자치도', '강원도', '강원'], full: '강원특별자치도', region: '' },
  { aliases: ['제주특별자치도', '제주도', '제주시', '제주'], full: '제주특별자치도', region: '' },
]

// 동/구/시/군이 아닌 도로명·건물 토큰을 가려내기 위한 접미사
const ROAD_SUFFIX = /(로|길|가)$/

export function parseKoreanRegion(rawAddress: string | null | undefined): RegionParts {
  const empty: RegionParts = {
    sido: null, si: null, gu: null, gun: null, dong: null,
    region: null, primaryLocal: null, ladder: [],
  }
  if (!rawAddress) return empty

  let address = rawAddress.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!address) return empty

  // 1) 시/도 추출 — 주소 앞부분에서 별칭 매칭 후 해당 부분 제거
  let sido: string | null = null
  let region: string | null = null
  for (const entry of SIDO_TABLE) {
    const hit = entry.aliases.find((a) => address.startsWith(a))
    if (hit) {
      sido = entry.full
      region = entry.region || null // 수도권만 값이 있고 나머지는 null
      address = address.slice(hit.length).trim()
      break
    }
  }

  // 2) 토큰 단위로 시·군·구·동 추출
  const tokens = address.split(' ')
  let si: string | null = null
  let gu: string | null = null
  let gun: string | null = null
  let dong: string | null = null

  for (const token of tokens) {
    if (ROAD_SUFFIX.test(token)) continue // 도로명(테헤란로 등)은 건너뜀
    if (!si && /[가-힣]시$/.test(token)) si = token
    else if (!gu && /[가-힣]구$/.test(token)) gu = token
    else if (!gun && /[가-힣]군$/.test(token)) gun = token
    else if (!dong && /[가-힣0-9](동|읍|면)$/.test(token)) dong = token
  }

  // 대표 지역명: 가장 구체적이면서 사장님이 "내 동네"로 인지하는 단위
  const primaryLocal = gu ?? gun ?? si ?? sido

  // 3) 지역 사다리 (좁은→넓은) — 중복·빈 값 제거
  const ladder = [dong, gu, gun, si, sido, region].filter(
    (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
  )

  return { sido, si, gu, gun, dong, region, primaryLocal, ladder }
}

// 주소 사다리 + 사장님이 추가한 출장 지역을 합쳐 최종 areaServed 목록 생성.
// 중복 제거하고, 좁은 지역(주소 사다리)을 앞에 둬 핵심 신호를 우선한다.
export function buildAreaServed(
  address: string | null | undefined,
  extraServiceAreas?: string[] | null,
): string[] {
  const ladder = parseKoreanRegion(address).ladder
  const extras = (extraServiceAreas ?? [])
    .map((s) => s.normalize('NFC').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  return [...ladder, ...extras].filter((v) => {
    if (seen.has(v)) return false
    seen.add(v)
    return true
  })
}

// AI 콘텐츠 생성 프롬프트에 주입할 "지역 사다리" 지시문 생성.
// 핵심 지역(동/구)에 집중하되 상위 지역을 가끔 언급하도록 LLM을 유도한다.
export function buildRegionPromptHint(
  address: string | null | undefined,
  extraServiceAreas?: string[] | null,
): string {
  const parts = parseKoreanRegion(address)
  if (!parts.primaryLocal && !address) return '위치 정보 없음'

  const core = parts.dong
    ? `${parts.primaryLocal ?? ''} ${parts.dong}`.trim()
    : parts.primaryLocal ?? address ?? ''
  const wider = [parts.si, parts.sido, parts.region].filter(
    (v, i, arr): v is string => !!v && v !== parts.primaryLocal && arr.indexOf(v) === i,
  )
  const extras = (extraServiceAreas ?? []).map((s) => s.trim()).filter(Boolean)

  const lines = [`핵심 지역(글·키워드의 중심, 가장 자주 언급): ${core}`]
  if (wider.length) lines.push(`상위 지역(가끔 함께 언급해 검색 범위 확장): ${wider.join(', ')}`)
  if (extras.length) lines.push(`추가 출장 지역(자연스럽게 1~2회 언급): ${extras.join(', ')}`)
  return lines.join('\n')
}
