import 'server-only'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { ProposalBusiness } from './build'
import type { ProposalSettings } from './content'

export interface ProposalContext {
  business: ProposalBusiness
  settings: ProposalSettings | null
}

// 로그인한 사장님의 업체 + 소개서 설정을 함께 로드 (인쇄 페이지·에디터 공용).
// 리치 마케팅 컬럼은 database.ts 타입에 없어 as never / as unknown as 로 읽는다.
export async function loadProposalContext(): Promise<ProposalContext | null> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) return null

  const { data } = (await db
    .from('businesses')
    .select(
      'name, phone, address, slug, logo_url, hero_image_url, brand_color, brand_color_secondary, description, hero_subtitle, strengths, portfolio, proposal_settings' as never,
    )
    .eq('id', profile.business_id)
    .maybeSingle()) as unknown as {
      data: (ProposalBusiness & { proposal_settings: ProposalSettings | null }) | null
    }

  if (!data) return null
  const { proposal_settings, ...business } = data
  return { business, settings: proposal_settings ?? null }
}
