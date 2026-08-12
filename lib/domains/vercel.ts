import 'server-only'

// Vercel 도메인 API 래퍼 — 고객사 자체 도메인을 퀄리오 프로젝트에 붙이고 상태를 확인한다.
//
// 흐름: addProjectDomain(등록) → 사장님이 DNS 설정 → getDomainStatus(확인) → active
// 등록만으로는 화면이 뜨지 않는다. 도메인 소유자가 DNS에서 퀄리오(Vercel)를 가리켜야 완성된다.

const API = 'https://api.vercel.com'

// DNS 안내 기본값 — Vercel API가 권장값을 주면 그 값을 우선 쓰고, 없을 때만 이걸 보여준다
export const DEFAULT_A_RECORD = '76.76.21.21'
export const DEFAULT_CNAME = 'cname.vercel-dns.com'

export interface DomainStatus {
  /** 퀄리오 프로젝트에 등록돼 있는가 */
  registered: boolean
  /** 소유 확인까지 끝났는가 (Vercel 기준 verified) */
  verified: boolean
  /** DNS가 아직 퀄리오를 안 가리키는가 */
  misconfigured: boolean
  /** 사장님에게 보여줄 DNS 값 */
  aRecord: string
  cname: string
}

interface VercelErrorBody {
  error?: { code?: string; message?: string }
}

interface ProjectDomainResponse {
  name?: string
  verified?: boolean
}

interface DomainConfigResponse {
  misconfigured?: boolean
  recommendedIPv4?: { value?: string[] }[]
  recommendedCNAME?: { value?: string }[]
}

// 환경변수 이름에 VERCEL_ 접두사를 쓰지 않는 이유:
// Vercel은 VERCEL_로 시작하는 이름을 시스템 변수용으로 예약해 두고 있어
// 대시보드에서 같은 이름의 사용자 변수를 만들 수 없다. 그래서 QUALIO_ 접두사를 쓴다.
function requireEnv(): { token: string; projectId: string; teamId: string | null } {
  const token = process.env.QUALIO_VERCEL_TOKEN
  const projectId = process.env.QUALIO_VERCEL_PROJECT_ID
  if (!token || !projectId) {
    throw new Error('[APP] 도메인 연결 기능이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요')
  }
  return { token, projectId, teamId: process.env.QUALIO_VERCEL_TEAM_ID ?? null }
}

async function callVercel<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: T & VercelErrorBody }> {
  const { token, teamId } = requireEnv()
  const sep = path.includes('?') ? '&' : '?'
  const url = `${API}${path}${teamId ? `${sep}teamId=${teamId}` : ''}`

  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })

  let data: T & VercelErrorBody
  try {
    data = (await res.json()) as T & VercelErrorBody
  } catch {
    data = {} as T & VercelErrorBody
  }
  return { ok: res.ok, status: res.status, data }
}

/** 퀄리오 Vercel 프로젝트에 도메인을 등록한다. 이미 등록돼 있으면 성공으로 본다. */
export async function addProjectDomain(domain: string): Promise<void> {
  const { projectId } = requireEnv()
  const { ok, data } = await callVercel<ProjectDomainResponse>(
    `/v10/projects/${projectId}/domains`,
    { method: 'POST', body: { name: domain } },
  )

  if (ok) return

  const code = data.error?.code
  // 이 프로젝트에 이미 붙어 있는 경우 — 재시도로 들어온 것이니 정상 처리
  if (code === 'domain_already_in_use_by_this_project') return

  if (code === 'domain_already_in_use' || code === 'domain_taken') {
    throw new Error('[APP] 이 주소는 이미 다른 곳에 연결되어 있어요. 다른 주소를 입력하거나 고객센터로 문의해주세요')
  }
  if (code === 'forbidden' || code === 'not_authorized') {
    throw new Error('[APP] 도메인을 연결할 권한이 없어요. 고객센터로 문의해주세요')
  }

  console.error('[CustomDomain] Vercel 도메인 등록 실패:', code, data.error?.message)
  throw new Error('[APP] 주소를 연결하지 못했어요. 주소를 다시 확인하고 시도해주세요')
}

/** 등록 상태 + DNS가 실제로 퀄리오를 가리키는지 확인한다. */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const { projectId } = requireEnv()

  const [projectDomain, config] = await Promise.all([
    callVercel<ProjectDomainResponse>(`/v9/projects/${projectId}/domains/${domain}`, { method: 'GET' }),
    callVercel<DomainConfigResponse>(`/v6/domains/${domain}/config`, { method: 'GET' }),
  ])

  const aRecord = config.data.recommendedIPv4?.[0]?.value?.[0] ?? DEFAULT_A_RECORD
  const cname = config.data.recommendedCNAME?.[0]?.value ?? DEFAULT_CNAME

  return {
    registered: projectDomain.ok,
    verified: projectDomain.data.verified === true,
    // config 조회가 실패하면 "아직 설정 안 됨"으로 보수적으로 판단한다
    misconfigured: config.ok ? config.data.misconfigured !== false : true,
    aRecord,
    cname,
  }
}

/** 연결 해제 — 프로젝트에서 도메인을 뗀다. 없으면 조용히 넘어간다. */
export async function removeProjectDomain(domain: string): Promise<void> {
  const { projectId } = requireEnv()
  const { ok, status, data } = await callVercel<Record<string, never>>(
    `/v9/projects/${projectId}/domains/${domain}`,
    { method: 'DELETE' },
  )
  if (ok || status === 404) return

  console.error('[CustomDomain] Vercel 도메인 해제 실패:', data.error?.code, data.error?.message)
  throw new Error('[APP] 연결을 끊지 못했어요. 잠시 후 다시 시도해주세요')
}
