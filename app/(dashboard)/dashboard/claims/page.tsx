import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldAlert, Phone, CheckCircle2, AlertTriangle } from 'lucide-react'
import { AddClaimForm } from '@/components/dashboard/add-claim-form'
import { ClaimActions } from '@/components/dashboard/claim-actions'

interface ClaimRow {
  id: string
  customer_name: string
  customer_phone: string | null
  title: string
  content: string | null
  is_urgent: boolean
  status: string
  resolution: string | null
  created_at: string
  resolved_at: string | null
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

export default async function ClaimsPage() {
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

  const [{ data }, { data: customerRows }] = await Promise.all([
    db
      .from('claims' as never)
      .select('id, customer_name, customer_phone, title, content, is_urgent, status, resolution, created_at, resolved_at' as never)
      .eq('business_id' as never, profile.business_id)
      .order('is_urgent' as never, { ascending: false })
      .order('created_at' as never, { ascending: false }) as unknown as Promise<{ data: ClaimRow[] | null }>,
    // 클레임 등록 시 기존 고객을 골라 자동 채우기 위한 목록
    db
      .from('customers')
      .select('id, name, phone, address')
      .eq('business_id', profile.business_id)
      .order('name', { ascending: true }),
  ])

  const claims = data ?? []
  const customers = (customerRows ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }))
  const openClaims = claims.filter((c) => c.status !== 'resolved')
  const resolvedClaims = claims.filter((c) => c.status === 'resolved')

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-500" />
            클레임 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            고객 불만·하자를 기록하고 해결까지 챙기세요
          </p>
        </div>
        <AddClaimForm customers={customers} />
      </div>

      {/* 미해결 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          미해결 {openClaims.length > 0 && `(${openClaims.length})`}
        </h2>

        {openClaims.length === 0 ? (
          <div className="text-center py-12 space-y-3 bg-white rounded-xl border border-dashed border-border">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="text-muted-foreground">미해결 클레임이 없어요. 깔끔합니다!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {openClaims.map((claim) => (
              <article key={claim.id} className="bg-white rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {claim.is_urgent && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="h-3 w-3" />
                          긴급
                        </span>
                      )}
                      <p className="font-semibold">{claim.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{claim.customer_name}</p>
                    {claim.customer_phone && (
                      <a
                        href={`tel:${claim.customer_phone}`}
                        className="inline-flex items-center gap-1 text-xs text-primary mt-0.5"
                      >
                        <Phone className="h-3 w-3" />
                        {claim.customer_phone}
                      </a>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(claim.created_at)}</span>
                </div>

                {claim.content && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
                    {claim.content}
                  </p>
                )}

                <ClaimActions claimId={claim.id} status={claim.status} />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 해결됨 */}
      {resolvedClaims.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            해결됨 ({resolvedClaims.length})
          </h2>
          <div className="space-y-2">
            {resolvedClaims.map((claim) => (
              <article key={claim.id} className="bg-muted/30 rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-muted-foreground line-through decoration-muted-foreground/40">
                      {claim.title}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">{claim.customer_name}</p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {claim.resolved_at ? fmtDate(claim.resolved_at) : '해결'}
                  </span>
                </div>
                {claim.resolution && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
                    해결: {claim.resolution}
                  </p>
                )}
                <ClaimActions claimId={claim.id} status={claim.status} />
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
