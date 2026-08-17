'use server'

import { z } from 'zod'
import { action } from '@/lib/safe-action'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizeDomain, isPlatformHost, isApexDomain } from '@/lib/domains/host'
import { addProjectDomain, getDomainStatus, removeProjectDomain, DEFAULT_A_RECORD, DEFAULT_CNAME } from '@/lib/domains/vercel'

// 고객사 자체 도메인 연결
//
// 왜 필요한가: 모든 고객사 홈페이지가 퀄리오 도메인 한 곳에 모여 있으면, 같은 지역 업체끼리
// 한 도메인 안에서 같은 검색어로 경쟁하게 되고(검색엔진은 한 검색어에 한 도메인 결과를 1~2개만 노출)
// 한 곳이 저품질 판정을 받으면 나머지까지 같이 눌린다. 자기 도메인으로 띄우면 둘 다 사라진다.

interface DomainInfo {
  domain: string
  status: string
  /** DNS 설정이 끝나 실제로 그 주소로 홈페이지가 뜨는 상태 */
  live: boolean
  /** 사장님이 도메인 산 곳에 넣어야 하는 값 */
  recordType: 'A' | 'CNAME'
  recordName: string
  recordValue: string
}

/** 업체를 찾고 로그인 상태를 확인한다 */
async function requireBusiness(): Promise<{ businessId: string }> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) throw new Error('[APP] 로그인이 필요합니다')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')
  return { businessId: profile.business_id }
}

/** Vercel 상태를 DB에 반영하고 사장님에게 보여줄 정보를 만든다 */
async function syncStatus(businessId: string, domain: string): Promise<DomainInfo> {
  const status = await getDomainStatus(domain)
  const live = status.registered && status.verified && !status.misconfigured

  const db = createServiceClient()
  await db
    .from('businesses')
    .update({
      custom_domain_status: live ? 'active' : 'pending',
      ...(live ? { custom_domain_connected_at: new Date().toISOString() } : {}),
    } as never)
    .eq('id', businessId)

  const apex = isApexDomain(domain)
  return {
    domain,
    status: live ? 'active' : 'pending',
    live,
    recordType: apex ? 'A' : 'CNAME',
    recordName: apex ? '@' : domain.split('.')[0],
    recordValue: apex ? (status.aRecord || DEFAULT_A_RECORD) : (status.cname || DEFAULT_CNAME),
  }
}

const connectSchema = z.object({
  domain: z.string().min(4, '주소를 입력해주세요').max(253),
})

/** 도메인을 퀄리오에 등록한다. 이 시점엔 아직 화면이 안 뜬다 — 사장님이 DNS를 설정해야 완성. */
export const connectCustomDomainAction = action
  .schema(connectSchema)
  .action(async ({ parsedInput }) => {
    const { businessId } = await requireBusiness()

    const domain = normalizeDomain(parsedInput.domain)
    if (!domain) {
      throw new Error('[APP] 주소 형식이 올바르지 않아요. 예: mycleaning.co.kr')
    }
    if (isPlatformHost(domain)) {
      throw new Error('[APP] 퀄리오 주소는 연결할 수 없어요. 사장님이 가지고 계신 주소를 입력해주세요')
    }

    const db = createServiceClient()

    // 홈페이지가 아직 만들어지지 않았으면 연결해도 보여줄 게 없다
    const { data: biz } = (await db
      .from('businesses')
      .select('slug' as never)
      .eq('id', businessId)
      .maybeSingle()) as unknown as { data: { slug: string | null } | null }
    if (!biz?.slug) {
      throw new Error('[APP] 홈페이지를 먼저 만들어주세요. 업체 정보를 저장하면 홈페이지가 만들어져요')
    }

    // 다른 업체가 쓰고 있는 주소인지 확인
    const { data: taken } = (await db
      .from('businesses')
      .select('id' as never)
      .eq('custom_domain' as never, domain as never)
      .maybeSingle()) as unknown as { data: { id: string } | null }
    if (taken && taken.id !== businessId) {
      throw new Error('[APP] 이미 다른 곳에서 사용 중인 주소예요')
    }

    await addProjectDomain(domain)

    // apex(www 없는 주소)를 연결하면 www 주소도 같이 등록해 본 주소로 넘어가게 한다.
    // 사장님·고객이 'www.'를 붙여 들어와도 홈페이지가 뜬다. 실패해도 본 연결은 살린다.
    if (isApexDomain(domain)) {
      try {
        await addProjectDomain(`www.${domain}`)
      } catch {
        console.error('[CustomDomain] www 주소 등록 실패(무시):', domain)
      }
    }

    await db
      .from('businesses')
      .update({ custom_domain: domain, custom_domain_status: 'pending' } as never)
      .eq('id', businessId)

    const info = await syncStatus(businessId, domain)
    revalidatePath('/dashboard/settings')
    return info
  })

/** '연결 확인' — DNS가 퀄리오를 가리키기 시작했는지 다시 본다 */
export const checkCustomDomainAction = action
  .schema(z.object({}))
  .action(async () => {
    const { businessId } = await requireBusiness()

    const db = createServiceClient()
    const { data: biz } = (await db
      .from('businesses')
      .select('custom_domain' as never)
      .eq('id', businessId)
      .maybeSingle()) as unknown as { data: { custom_domain: string | null } | null }

    if (!biz?.custom_domain) throw new Error('[APP] 연결된 주소가 없어요')

    const info = await syncStatus(businessId, biz.custom_domain)
    revalidatePath('/dashboard/settings')
    return info
  })

/** 연결 해제 — 홈페이지는 퀄리오 주소로 돌아간다 */
export const disconnectCustomDomainAction = action
  .schema(z.object({}))
  .action(async () => {
    const { businessId } = await requireBusiness()

    const db = createServiceClient()
    const { data: biz } = (await db
      .from('businesses')
      .select('custom_domain' as never)
      .eq('id', businessId)
      .maybeSingle()) as unknown as { data: { custom_domain: string | null } | null }

    if (biz?.custom_domain) {
      await removeProjectDomain(biz.custom_domain)
      if (isApexDomain(biz.custom_domain)) {
        try {
          await removeProjectDomain(`www.${biz.custom_domain}`)
        } catch {
          console.error('[CustomDomain] www 주소 해제 실패(무시):', biz.custom_domain)
        }
      }
    }

    await db
      .from('businesses')
      .update({ custom_domain: null, custom_domain_status: 'none', custom_domain_connected_at: null } as never)
      .eq('id', businessId)

    revalidatePath('/dashboard/settings')
    return { success: true }
  })

// 네이버·구글 검색 등록용 소유확인 코드 저장
//
// 네이버 서치어드바이저·구글 서치콘솔에 자기 도메인을 등록하려면 "이 사이트가 내 것"임을
// 증명해야 하고, 그 방법이 홈페이지 <head>에 발급받은 코드를 넣는 것이다.
// 사장님이 붙여넣는 값은 <meta ... content="여기"> 통째일 수도, content 값만일 수도 있어
// 어느 쪽이든 받아 content 값만 뽑아 저장한다(안 그러면 태그가 태그 안에 들어가 깨진다).
const verificationSchema = z.object({
  naver: z.string().trim().max(500).optional(),
  google: z.string().trim().max(500).optional(),
})

function extractVerificationCode(raw: string | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  // <meta name="naver-site-verification" content="abc123" /> 통째로 붙여넣은 경우
  const fromTag = v.match(/content\s*=\s*["']([^"']+)["']/i)
  return (fromTag ? fromTag[1] : v).trim() || null
}

export const updateSiteVerificationAction = action
  .schema(verificationSchema)
  .action(async ({ parsedInput }) => {
    const { businessId } = await requireBusiness()

    const db = createServiceClient()
    const { error } = await db
      .from('businesses')
      .update({
        naver_site_verification: extractVerificationCode(parsedInput.naver),
        google_site_verification: extractVerificationCode(parsedInput.google),
      } as never)
      .eq('id', businessId)

    if (error) {
      console.error('[CustomDomain] 소유확인 코드 저장 실패:', error)
      throw new Error('[APP] 저장 못 했어요. 다시 눌러주세요')
    }

    revalidatePath('/dashboard/settings')
    return { success: true }
  })
