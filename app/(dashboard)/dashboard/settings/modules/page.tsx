import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEnabledModules, quoteFor } from '@/lib/config/module-subscription'
import { ModuleSwitches } from '@/components/dashboard/module-switches'

export const metadata = { title: '쓰는 기능 고르기' }

export default async function ModulesPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) redirect('/onboarding')

  const businessId = profile.business_id
  const [enabled, quote] = await Promise.all([
    getEnabledModules(businessId),
    quoteFor(businessId),
  ])

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <Link
        href="/dashboard/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        설정
      </Link>

      <h1 className="text-xl font-bold">쓰는 기능 고르기</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        안 쓰시는 건 끄시면 그만큼 요금이 내려가요. 껐다가 언제든 다시 켜실 수 있어요.
      </p>

      <ModuleSwitches
        enabled={enabled}
        monthly={quote.monthly}
        lines={quote.lines}
        basis={quote.basis}
      />
    </div>
  )
}
