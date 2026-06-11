import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { generateQuotePitch } from '@/lib/ai/quote-pitch'
import { QuoteBookingSection } from '@/components/quote/quote-booking-section'
import type { QuotePitch } from '@/lib/ai/quote-pitch'
import type { Json } from '@/lib/types/database'
import { Phone } from 'lucide-react'

interface PageProps {
  params: Promise<{ businessId: string; quoteId: string }>
}

export default async function QuoteLandingPage({ params }: PageProps) {
  const { businessId, quoteId } = await params
  const db = createServiceClient()

  const [{ data: quote }, { data: business }] = await Promise.all([
    db
      .from('quotes')
      .select('id, cleaning_type, space_size, preferred_date, good_price, better_price, best_price, status, customer_name, customer_phone, ai_pitch')
      .eq('id', quoteId)
      .eq('business_id', businessId)
      .maybeSingle(),
    db
      .from('businesses')
      .select('name, phone, description, slug')
      .eq('id', businessId)
      .maybeSingle(),
  ])

  if (!quote || !business) notFound()

  let pitch: QuotePitch
  if (quote.ai_pitch && typeof quote.ai_pitch === 'object' && 'headline' in quote.ai_pitch) {
    pitch = quote.ai_pitch as unknown as QuotePitch
  } else {
    pitch = await generateQuotePitch({
      businessName: business.name,
      category:     business.description ?? null,
      serviceName:  quote.cleaning_type ?? '청소 서비스',
      spaceSize:    quote.space_size ?? null,
    })
    db.from('quotes').update({ ai_pitch: pitch as unknown as Json }).eq('id', quoteId).then()
  }

  // cleaningFacts가 없는 캐시(이전 버전)면 fallback 값 사용
  const facts = pitch.cleaningFacts ?? [
    { number: '3배', label: 'VOC 농도', detail: '새 아파트 입주 직후' },
    { number: '47종', label: '세균 서식', detail: '주방 싱크대 배수구' },
    { number: '6개월', label: '자연 휘발', detail: '방치 시 제거 기간' },
  ]

  const tiers = [
    { tier: 'good',   label: '기본',     price: quote.good_price   ?? 0, highlight: false },
    { tier: 'better', label: '추천',     price: quote.better_price ?? 0, highlight: true  },
    { tier: 'best',   label: '프리미엄', price: quote.best_price   ?? 0, highlight: false },
  ]

  const isBooked = quote.status === 'booked'

  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO: 다크 배경 ── */}
      <section className="bg-zinc-900 text-white">
        {/* 헤더 */}
        <header className="max-w-lg mx-auto px-5 pt-5 pb-0 flex items-center justify-between">
          <div>
            <p className="font-bold text-base">{business.name}</p>
            <p className="text-zinc-400 text-xs mt-0.5">맞춤 견적서</p>
          </div>
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 transition px-3 py-2 rounded-xl text-sm font-medium"
            >
              <Phone className="h-3.5 w-3.5" />
              {business.phone}
            </a>
          )}
        </header>

        {/* 헤드라인 */}
        <div className="max-w-lg mx-auto px-5 pt-8 pb-10 space-y-4">
          {quote.space_size && (
            <div className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-semibold px-3 py-1.5 rounded-full">
              {quote.cleaning_type} · {quote.space_size}평 맞춤 견적
            </div>
          )}
          <h1 className="text-3xl font-black leading-tight tracking-tight">
            {pitch.headline}
          </h1>
          <p className="text-zinc-300 text-sm leading-relaxed">
            {pitch.subheadline}
          </p>
        </div>

        {/* 통계 3개 — 배경에 걸침 */}
        <div className="max-w-lg mx-auto px-5 pb-0">
          <div className="grid grid-cols-3 gap-3 bg-zinc-800 rounded-2xl p-4">
            {facts.map((fact, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-black text-white tabular-nums">{fact.number}</p>
                <p className="text-[11px] font-semibold text-orange-400 mt-0.5">{fact.label}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{fact.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 라운드 전환 */}
        <div className="h-8 bg-white rounded-t-[2rem] mt-6" />
      </section>

      {/* ── CONTENT ── */}
      <main className="max-w-lg mx-auto px-5 pb-20 -mt-2 space-y-10">

        {/* 왜 필요한가 */}
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">왜 지금 전문 청소가 필요한가요?</h2>
          <div className="space-y-3">
            {pitch.reasons.map((reason, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-2xl border border-zinc-100 bg-zinc-50">
                <span className="text-2xl shrink-0 mt-0.5">{reason.emoji}</span>
                <div>
                  <p className="font-bold text-sm">{reason.title}</p>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{reason.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 구분선 */}
        <div className="h-px bg-zinc-100" />

        {/* 예약 섹션 */}
        {isBooked ? (
          <div className="rounded-2xl bg-green-50 border border-green-200 p-8 text-center space-y-3">
            <div className="text-4xl">✅</div>
            <h2 className="font-bold text-lg">이미 예약 완료된 견적입니다</h2>
            <p className="text-sm text-zinc-500">담당자가 곧 연락드릴 예정입니다.</p>
          </div>
        ) : (
          <QuoteBookingSection
            quoteId={quoteId}
            tiers={tiers}
            defaultName={quote.customer_name ?? undefined}
            defaultPhone={quote.customer_phone ?? undefined}
          />
        )}

        {/* 긴급성 */}
        {!isBooked && (
          <div className="rounded-2xl bg-zinc-900 text-white px-5 py-4 text-center">
            <p className="text-sm font-semibold">⏰ {pitch.urgencyText}</p>
          </div>
        )}

        {/* 하단 */}
        <div className="text-center text-xs text-zinc-400 space-y-1 pt-4">
          <p>{business.name}이 직접 준비한 견적입니다</p>
          {business.phone && (
            <p>문의 <a href={`tel:${business.phone}`} className="text-zinc-700 underline">{business.phone}</a></p>
          )}
          <p className="pt-2 text-zinc-300">Powered by 퀄리오</p>
        </div>
      </main>
    </div>
  )
}
