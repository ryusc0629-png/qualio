import Link from 'next/link'
import { Phone } from 'lucide-react'
import { getDomainOutreachTargets } from '@/lib/admin/domain-outreach'
import { formatDate } from '@/lib/format/datetime'
import { PitchButton } from './pitch-button'

// 연락 명단은 항상 최신으로 본다
export const dynamic = 'force-dynamic'

export default async function DomainOutreachPage() {
  const rows = await getDomainOutreachTargets()
  const due = rows.filter((r) => r.dueNow)
  const crowded = rows.filter((r) => r.regionPeers >= 3)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">자체 도메인 안 붙인 업체</h1>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          퀄리오 주소를 함께 쓰는 곳 {rows.length}곳 · 지금 연락할 곳 {due.length}곳
          {crowded.length > 0 && ` · 이 중 ${crowded.length}곳은 같은 지역이 3곳 넘어 이미 밀리는 중`}
        </p>
        <p className="mt-2 rounded-lg border border-dashed bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
          할 말: 지금은 홈페이지가 퀄리오 주소로 열려서 검색 점수가 퀄리오에 쌓입니다. 자기 주소로 옮기면
          그 점수가 업체 이름으로 쌓이고, 나중에 어디로 가도 주소는 계속 자기 것입니다. 주소값은 연 1~2만 원이고
          구입·설정은 저희가 대신 합니다. 설정 화면에 &lsquo;내 인터넷 주소 만들어주세요&rsquo; 버튼만 눌러주시면 됩니다.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed bg-background py-12 text-center">
          <p className="text-sm text-muted-foreground">연락할 곳이 없어요</p>
          <p className="text-xs text-muted-foreground">홈페이지가 있는 업체 모두 자체 주소를 쓰고 있어요</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.businessId}
              className={`rounded-xl border bg-background p-4 ${r.dueNow ? '' : 'opacity-60'} ${
                r.regionPeers >= 3 ? 'border-amber-300' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <Link href={`/admin/businesses/${r.businessId}`} className="hover:text-primary hover:underline">
                      {r.name}
                    </Link>
                    {r.regionPeers >= 3 && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 align-middle">
                        같은 지역 {r.regionPeers}곳
                      </span>
                    )}
                    {!r.hasPage && (
                      <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground align-middle">
                        홍보 페이지 없음
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.region ?? '주소 미입력'}</p>
                  <p className="mt-1 text-xs text-foreground/80">{r.reason}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {r.pitchedAt
                      ? `${formatDate(r.pitchedAt, { year: 'numeric', month: 'long', day: 'numeric' })} 연락함 · ${r.daysSincePitch}일 전`
                      : '아직 얘기 안 꺼냄'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {r.phone && (
                    <a
                      href={`tel:${r.phone.replace(/[^0-9]/g, '')}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {r.phone}
                    </a>
                  )}
                  <PitchButton businessId={r.businessId} contacted={!!r.pitchedAt} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
