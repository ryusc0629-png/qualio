import Link from 'next/link'
import { Phone } from 'lucide-react'
import { getOnboardingGaps } from '@/lib/admin/onboarding-gaps'
import { formatDate } from '@/lib/format/datetime'

// 연락 대상은 항상 최신으로 본다
export const dynamic = 'force-dynamic'

export default async function OnboardingGapsPage() {
  const rows = await getOnboardingGaps()
  const stuck = rows.filter((r) => r.missing.includes('서비스 항목'))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">첫 세팅이 안 끝난 업체</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          가입 후 하루가 지났는데 아직 설정이 남은 곳만 모았어요. 총 {rows.length}곳
          {stuck.length > 0 && ` · 이 중 ${stuck.length}곳은 서비스 항목조차 없어 견적을 못 만들어요`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed bg-background py-12 text-center">
          <p className="text-sm text-muted-foreground">연락할 곳이 없어요</p>
          <p className="text-xs text-muted-foreground">가입한 업체 모두 첫 세팅을 끝냈어요</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.businessId} className="rounded-xl border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <Link href={`/admin/businesses/${r.businessId}`} className="hover:text-primary hover:underline">
                      {r.name}
                    </Link>
                    {!r.hasActivity && (
                      <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-600 align-middle">
                        아직 한 번도 안 써봤어요
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(r.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })} 가입 · {r.hoursSinceSignup}시간 경과
                  </p>
                </div>
                {r.phone && (
                  <a
                    href={`tel:${r.phone.replace(/[^0-9]/g, '')}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:border-primary"
                  >
                    <Phone className="h-4 w-4 text-emerald-600" />
                    {r.phone}
                  </a>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.missing.map((m) => (
                  <span key={m} className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {m}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
