import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, X, Phone, MapPin, Globe, Bug } from 'lucide-react'
import { getBusinessDetail } from '@/lib/admin/business-detail'
import { betaBadgeLabel } from '@/lib/config/beta'
import { ResetPasswordButton } from './reset-password-button'

// 항상 최신 상태로 본다(CS 통화 중에 보는 화면이라 캐시 금지)
export const dynamic = 'force-dynamic'

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

export default async function AdminBusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const detail = await getBusinessDetail(businessId)
  if (!detail) notFound()

  const notDone = detail.setupChecks.filter((c) => !c.done)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/businesses" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />회원 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold">{detail.name}</h1>
          {detail.betaNumber && (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {betaBadgeLabel(detail.betaNumber, detail.lifetimeDiscountRate)}
            </span>
          )}
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {detail.planLabel}
            {detail.planStatus ? ` · ${detail.planStatus}` : ''}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {detail.ownerName ?? '대표자명 없음'} · {detail.ownerEmail ?? '이메일 없음'} · {formatDate(detail.createdAt)} 가입
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">고객사 데이터는 못 고쳐요. 계정 잠김을 푸는 것만 아래에서 할 수 있어요.</p>
      </div>

      {/* 비밀번호 잊음 — CS 전화에서 가장 급한 건. 원문은 알 수 없으니 임시 비번을 만들어 불러준다 */}
      <ResetPasswordButton
        businessId={detail.businessId}
        businessName={detail.name}
        ownerEmail={detail.ownerEmail}
      />

      {/* 연락 수단 — 통화 중 바로 누를 수 있게 */}
      <div className="flex flex-wrap gap-2">
        {detail.phone && (
          <a href={`tel:${detail.phone.replace(/[^0-9]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:border-primary">
            <Phone className="h-4 w-4 text-emerald-600" />{detail.phone}
          </a>
        )}
        {detail.address && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />{detail.address}
          </span>
        )}
        {detail.slug && (
          <a href={`/biz/${detail.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:border-primary">
            <Globe className="h-4 w-4 text-primary" />홈페이지 열기
          </a>
        )}
      </div>

      {/* 첫 세팅 상태 — CS 전화의 대부분이 여기서 걸린다 */}
      <section className="rounded-xl border bg-background p-4">
        <h2 className="text-sm font-semibold">첫 세팅 상태</h2>
        {notDone.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-700">필요한 설정이 모두 끝났어요</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {notDone.length}가지가 아직 안 됐어요 — 통화 때 이 순서로 안내하면 돼요
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {detail.setupChecks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              {c.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div>
                <span className={c.done ? 'text-muted-foreground' : 'font-medium'}>{c.label}</span>
                {!c.done && <p className="text-xs text-muted-foreground">{c.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 사용량 */}
      <section className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          ['서비스', detail.counts.services],
          ['견적', detail.counts.quotes],
          ['예약', detail.counts.bookings],
          ['고객', detail.counts.customers],
          ['계약', detail.counts.contracts],
          ['직원', detail.counts.workers],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border bg-background p-3 text-center">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-lg font-bold tabular-nums">{value as number}</p>
          </div>
        ))}
      </section>

      {/* 최근 활동 */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-semibold">최근 예약</h2>
          {detail.recentBookings.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">아직 예약이 없어요</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {detail.recentBookings.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{b.customerName}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(b.scheduledAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{b.status}</p>
                    {b.finalPrice != null && (
                      <p className="text-xs tabular-nums">{b.finalPrice.toLocaleString('ko-KR')}원</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-background p-4">
          <h2 className="text-sm font-semibold">최근 견적</h2>
          {detail.recentQuotes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">아직 견적이 없어요</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {detail.recentQuotes.map((q) => (
                <li key={q.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">
                      {q.customerName ?? '이름 없음'}
                      {q.isTest && <span className="ml-1 text-[11px] text-muted-foreground">(테스트)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(q.createdAt)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{q.status}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 이 업체가 넣은 오류 신고 */}
      <section className="rounded-xl border bg-background p-4">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Bug className="h-4 w-4 text-destructive" />이 업체의 오류 신고
        </h2>
        {detail.recentBugReports.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">신고 없음</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {detail.recentBugReports.map((r) => (
              <li key={r.id} className="border-b pb-3 last:border-0">
                <p className="whitespace-pre-wrap">{r.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(r.createdAt)}
                  {r.pageUrl ? ` · ${r.pageUrl}` : ''}
                  {r.status ? ` · ${r.status}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
