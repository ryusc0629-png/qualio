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

  const { data: serviceItem } = await db
    .from('service_items')
    .select('photos')
    .eq('business_id', businessId)
    .eq('name', quote.cleaning_type ?? '')
    .is('deleted_at', null)
    .maybeSingle()

  const servicePhotos = serviceItem?.photos?.filter(Boolean) ?? []

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
    <div className="min-h-screen bg-[#F5F0EB]">

      {/* 헤더 */}
      <header className="bg-white sticky top-0 z-10 border-b border-[#F0EBE3]">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#FF7D00] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {business.name.slice(0, 1)}
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{business.name}</p>
              <p className="text-[11px] text-[#8D8D8D]">맞춤 견적서</p>
            </div>
          </div>
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              className="flex items-center gap-1.5 text-[#FF7D00] text-sm font-semibold"
            >
              <Phone className="h-3.5 w-3.5" />
              {business.phone}
            </a>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-20 space-y-5 pt-5">

        {/* 히어로 카드 */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          {quote.space_size && (
            <div className="inline-flex items-center gap-1.5 bg-[#FFF3E8] text-[#FF7D00] text-xs font-bold px-3 py-1.5 rounded-full mb-4">
              {quote.cleaning_type} · {quote.space_size}평
            </div>
          )}
          <h1 className="text-[22px] font-extrabold leading-snug text-[#1A1A1A] break-keep">
            {pitch.headline}
          </h1>
          <p className="text-sm text-[#8D8D8D] mt-2 leading-relaxed break-keep">
            {pitch.subheadline}
          </p>
        </div>

        {/* 사진 */}
        {servicePhotos.length > 0 && (
          <div className={`grid gap-2 ${servicePhotos.length === 1 ? 'grid-cols-1' : servicePhotos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {servicePhotos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt="시공 사진"
                className="w-full aspect-square object-cover rounded-2xl"
              />
            ))}
          </div>
        )}

        {/* 통계 3개 */}
        <div className="grid grid-cols-3 gap-3">
          {facts.map((fact, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 text-center shadow-sm">
              <p className="text-[22px] font-black text-[#FF7D00] tabular-nums leading-none">{fact.number}</p>
              <p className="text-[11px] font-bold text-[#1A1A1A] mt-1.5">{fact.label}</p>
              <p className="text-[10px] text-[#8D8D8D] mt-0.5 leading-tight">{fact.detail}</p>
            </div>
          ))}
        </div>

        {/* 왜 필요한가 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-1">
          <p className="text-xs font-bold text-[#FF7D00] mb-3">전문 청소가 필요한 이유</p>
          {pitch.reasons.map((reason, i) => (
            <div key={i} className={`flex gap-3 p-3 rounded-2xl ${i % 2 === 0 ? 'bg-[#F5F0EB]' : ''}`}>
              <span className="text-xl shrink-0">{reason.emoji}</span>
              <div>
                <p className="font-bold text-sm text-[#1A1A1A]">{reason.title}</p>
                <p className="text-xs text-[#8D8D8D] mt-0.5 leading-relaxed break-keep">{reason.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 긴급성 */}
        {!isBooked && (
          <div className="bg-[#FFF3E8] rounded-2xl px-5 py-4 flex items-center gap-3">
            <span className="text-xl shrink-0">⏰</span>
            <p className="text-sm font-semibold text-[#CC6400] break-keep">{pitch.urgencyText}</p>
          </div>
        )}

        {/* 예약 섹션 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          {isBooked ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">✅</div>
              <p className="font-bold text-lg">예약이 완료된 견적입니다</p>
              <p className="text-sm text-[#8D8D8D]">담당자가 곧 연락드릴 예정입니다.</p>
            </div>
          ) : (
            <QuoteBookingSection
              quoteId={quoteId}
              tiers={tiers}
              defaultName={quote.customer_name ?? undefined}
              defaultPhone={quote.customer_phone ?? undefined}
            />
          )}
        </div>

        {/* 하단 */}
        <div className="text-center text-xs text-[#B0B0B0] space-y-1 pb-4">
          <p>{business.name}이 직접 준비한 견적서입니다</p>
          {business.phone && (
            <p>문의 <a href={`tel:${business.phone}`} className="text-[#FF7D00] underline">{business.phone}</a></p>
          )}
          <p className="pt-1">Powered by 퀄리오</p>
        </div>
      </main>
    </div>
  )
}
