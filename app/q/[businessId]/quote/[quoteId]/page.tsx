import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { generateQuotePitch } from '@/lib/ai/quote-pitch'
import { QuoteBookingSection } from '@/components/quote/quote-booking-section'
import type { QuotePitch } from '@/lib/ai/quote-pitch'
import type { Json } from '@/lib/types/database'
import { Phone, ShieldCheck, Star, ChevronRight, Clock } from 'lucide-react'

interface PageProps {
  params: Promise<{ businessId: string; quoteId: string }>
}

export default async function QuoteLandingPage({ params }: PageProps) {
  const { businessId, quoteId } = await params
  const db = createServiceClient()

  const [{ data: quote }, { data: business }] = await Promise.all([
    db
      .from('quotes')
      .select('id, cleaning_type, space_size, good_price, better_price, best_price, status, customer_name, customer_phone, ai_pitch, created_at')
      .eq('id', quoteId)
      .eq('business_id', businessId)
      .maybeSingle(),
    db
      .from('businesses')
      .select('name, phone, description, slug, naver_place_url')
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
  const cached = quote.ai_pitch
  if (
    cached &&
    typeof cached === 'object' &&
    'headline' in cached &&
    'tierReasons' in cached
  ) {
    pitch = cached as unknown as QuotePitch
  } else {
    pitch = await generateQuotePitch({
      businessName: business.name,
      category:     business.description ?? null,
      serviceName:  quote.cleaning_type ?? '청소 서비스',
      spaceSize:    quote.space_size ?? null,
    })
    db.from('quotes').update({ ai_pitch: pitch as unknown as Json }).eq('id', quoteId).then()
  }

  const tiers = [
    { tier: 'good',   label: '기본',     price: quote.good_price   ?? 0, highlight: false },
    { tier: 'better', label: '추천',     price: quote.better_price ?? 0, highlight: true  },
    { tier: 'best',   label: '프리미엄', price: quote.best_price   ?? 0, highlight: false },
  ]

  const isBooked = quote.status === 'booked'

  // 견적 생성 후 48시간 만료
  const expiresAt = new Date(new Date(quote.created_at).getTime() + 48 * 60 * 60 * 1000)
  const hoursLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)))
  const isExpired = !isBooked && hoursLeft === 0
  const isUrgent = !isBooked && hoursLeft > 0 && hoursLeft <= 12

  return (
    <div className="min-h-screen bg-slate-50">

      {/* 헤더 */}
      <header className="bg-white sticky top-0 z-10 border-b border-border">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
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
              className="flex items-center gap-1.5 text-primary text-sm font-semibold"
            >
              <Phone className="h-3.5 w-3.5" />
              {business.phone}
            </a>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-32 pt-5 space-y-4">

        {/* ① 신뢰 배지 행 — 네이버 리뷰 + 업체 강점 */}
        <div className="space-y-2">
          {business.naver_place_url && (
            <a
              href={business.naver_place_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm"
            >
              <div className="w-9 h-9 bg-[#03C75A] rounded-xl flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-black">N</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-[#FFB800] text-[#FFB800]" />
                  ))}
                </div>
                <p className="text-xs text-[#8D8D8D]">네이버 실제 고객 리뷰 확인하기</p>
              </div>
              <ChevronRight className="h-4 w-4 text-[#B0B0B0] shrink-0" />
            </a>
          )}
          <div className="flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
            {pitch.reasons.map((reason, i) => (
              <span
                key={i}
                className="shrink-0 flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-xs font-semibold text-[#4A4A4A] shadow-sm border border-border"
              >
                <span>{reason.emoji}</span>
                {reason.title}
              </span>
            ))}
          </div>
        </div>

        {/* 견적 만료 배너 */}
        {!isBooked && (
          <div className={[
            'flex items-center gap-2.5 rounded-2xl px-4 py-3',
            isExpired
              ? 'bg-red-50 border border-red-200'
              : isUrgent
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-primary/10 border border-primary/30',
          ].join(' ')}>
            <Clock className={[
              'h-4 w-4 shrink-0',
              isExpired ? 'text-red-500' : 'text-primary',
            ].join(' ')} />
            <p className={[
              'text-xs font-semibold break-keep',
              isExpired ? 'text-red-700' : 'text-[#7A4200]',
            ].join(' ')}>
              {isExpired
                ? '이 견적은 만료됐어요. 새 견적을 다시 요청해 주세요.'
                : isUrgent
                  ? `⚡ 이 견적은 ${hoursLeft}시간 후 만료됩니다. 지금 바로 예약하세요!`
                  : `이 견적은 ${hoursLeft}시간 후 만료됩니다`
              }
            </p>
          </div>
        )}

        {/* ② 견적 확인 카드 */}
        <div className="bg-white rounded-3xl px-5 py-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {quote.cleaning_type && (
                <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full mb-3">
                  {quote.cleaning_type}{quote.space_size ? ` · ${quote.space_size}평` : ''}
                </div>
              )}
              <h1 className="text-[20px] font-extrabold leading-snug text-[#1A1A1A] break-keep">
                {pitch.headline}
              </h1>
              <p className="text-xs text-[#8D8D8D] mt-1.5 leading-relaxed break-keep">
                {pitch.subheadline}
              </p>
            </div>
          </div>

          {/* A/S 보증 인라인 */}
          <div className="mt-4 flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs font-semibold text-[#6B6B6B]">
              작업 후 <span className="text-[#1A1A1A]">3일 이내 무상 재방문</span> 보증
            </p>
          </div>
        </div>

        {/* ③ 플랜 선택 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <div className="mb-4">
            <p className="font-extrabold text-[17px] text-[#1A1A1A]">플랜을 선택하고 예약하세요</p>
            <p className="text-xs text-[#8D8D8D] mt-0.5">3가지 플랜 모두 동일한 최고 품질로 시공됩니다</p>
          </div>

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
              tierReasons={pitch.tierReasons}
              tierIncludes={pitch.tierIncludes}
            />
          )}
        </div>

        {/* ④ 작업 사진 */}
        {servicePhotos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#8D8D8D] px-1">실제 작업 사진</p>
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
          </div>
        )}

        {/* ⑤ 왜 이 업체인가 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-2">
          <p className="text-xs font-bold text-primary mb-1">이 업체를 선택하는 이유</p>
          {pitch.reasons.map((reason, i) => (
            <div key={i} className="flex gap-3 items-start py-2 border-b border-border last:border-0">
              <span className="text-lg shrink-0 mt-0.5">{reason.emoji}</span>
              <div>
                <p className="font-bold text-sm text-[#1A1A1A]">{reason.title}</p>
                <p className="text-xs text-[#8D8D8D] mt-0.5 leading-relaxed break-keep">{reason.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ⑤ 작업 포인트 3가지 (숫자 지표) */}
        {pitch.cleaningFacts && (
          <div className="grid grid-cols-3 gap-3">
            {pitch.cleaningFacts.map((fact, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <p className="text-[22px] font-black text-primary tabular-nums leading-none">{fact.number}</p>
                <p className="text-[11px] font-bold text-[#1A1A1A] mt-1.5">{fact.label}</p>
                <p className="text-[10px] text-[#8D8D8D] mt-0.5 leading-tight">{fact.detail}</p>
              </div>
            ))}
          </div>
        )}

        {/* 하단 */}
        <div className="text-center text-xs text-[#B0B0B0] space-y-1 pb-4">
          <p>{business.name}이 직접 준비한 견적서입니다</p>
          {business.phone && (
            <p>문의 <a href={`tel:${business.phone}`} className="text-primary underline">{business.phone}</a></p>
          )}
          <p className="pt-1">Powered by 퀄리오</p>
        </div>
      </main>
    </div>
  )
}
