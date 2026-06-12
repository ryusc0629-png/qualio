import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuoteToLeadButton } from '@/components/dashboard/quote-to-lead-button'
import { Phone, Calendar } from 'lucide-react'

const statusLabel: Record<string, { text: string; className: string }> = {
  pending:   { text: '대기중', className: 'bg-amber-100 text-amber-800' },
  booked:    { text: '예약됨', className: 'bg-green-100 text-green-800' },
  expired:   { text: '만료',   className: 'bg-gray-100 text-gray-500' },
  cancelled: { text: '취소',   className: 'bg-red-100 text-red-700' },
}

export default async function QuotesPage() {
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

  const { data: quotes } = await db
    .from('quotes')
    .select('id, cleaning_type, space_size, preferred_date, good_price, better_price, best_price, status, customer_name, customer_phone, created_at')
    .eq('business_id', profile.business_id)
    .order('created_at', { ascending: false })

  const totalCount   = quotes?.length ?? 0
  const pendingCount = quotes?.filter((q) => q.status === 'pending').length ?? 0
  const bookedCount  = quotes?.filter((q) => q.status === 'booked').length ?? 0
  const contactCount = quotes?.filter((q) => q.customer_phone).length ?? 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold">견적 요청</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          퀄리오 링크로 들어온 고객 견적 요청이에요
        </p>
      </div>

      {/* 요약 카드 */}
      {totalCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '전체',        value: totalCount,   className: 'text-foreground' },
            { label: '답변 대기',   value: pendingCount, className: 'text-amber-700' },
            { label: '예약 완료',   value: bookedCount,  className: 'text-green-700' },
            { label: '연락처 확보', value: contactCount, className: 'text-primary' },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${item.className}`}>
                {item.value}
                <span className="text-sm font-normal ml-0.5 text-muted-foreground">건</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {!quotes || quotes.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">아직 견적 요청이 없어요</p>
          <p className="text-xs text-muted-foreground">대시보드 홈에서 고객 링크를 공유해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((quote) => {
            const status = statusLabel[quote.status] ?? { text: quote.status, className: 'bg-gray-100 text-gray-600' }
            const hasContact = Boolean(quote.customer_phone)

            return (
              <div
                key={quote.id}
                className="bg-white rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">
                        {quote.cleaning_type ?? '서비스 미선택'}
                        {quote.space_size && (
                          <span className="ml-1 text-sm font-normal text-muted-foreground">
                            {quote.space_size}평
                          </span>
                        )}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                        {status.text}
                      </span>
                    </div>

                    <div className="mt-1.5 space-y-0.5">
                      {hasContact ? (
                        <p className="text-sm flex items-center gap-1 text-foreground">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {quote.customer_name && (
                            <span className="font-medium mr-0.5">{quote.customer_name}</span>
                          )}
                          <span className="text-muted-foreground">{quote.customer_phone}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">연락처 미입력</p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {quote.preferred_date ? `희망일 ${quote.preferred_date}` : '희망일 미정'}
                        {' · '}
                        {new Date(quote.created_at).toLocaleDateString('ko-KR')} 요청
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right space-y-2">
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>기본 <span className="tabular-nums text-foreground font-semibold">{quote.good_price?.toLocaleString() ?? '—'}원</span></p>
                      <p>추천 <span className="tabular-nums text-foreground font-semibold">{quote.better_price?.toLocaleString() ?? '—'}원</span></p>
                      <p>프리미엄 <span className="tabular-nums text-foreground font-semibold">{quote.best_price?.toLocaleString() ?? '—'}원</span></p>
                    </div>

                    {hasContact && quote.status === 'pending' && (
                      <QuoteToLeadButton
                        customerName={quote.customer_name ?? ''}
                        customerPhone={quote.customer_phone!}
                        cleaningType={quote.cleaning_type}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
