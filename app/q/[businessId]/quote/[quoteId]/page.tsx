import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { generateQuotePitch } from '@/lib/ai/quote-pitch'
import { QuoteBookingSection } from '@/components/quote/quote-booking-section'
import { QuoteCountdown } from '@/components/quote/quote-countdown'
import type { QuotePitch } from '@/lib/ai/quote-pitch'
import type { Json } from '@/lib/types/database'
import { Phone, ShieldCheck, Star, ChevronRight } from 'lucide-react'

interface PageProps {
  params: Promise<{ businessId: string; quoteId: string }>
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    let videoId: string | null = null
    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1).split('?')[0]
    } else if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v')
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : null
  } catch {
    return null
  }
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
      .select('name, phone, description, slug, naver_place_url, youtube_url')
      .eq('id', businessId)
      .maybeSingle(),
  ])

  if (!quote || !business) notFound()

  // 서비스 단위 조회 (에어컨=개, 청소=평당 등)
  const { data: serviceItem } = await db
    .from('service_items')
    .select('unit')
    .eq('business_id', businessId)
    .eq('name', quote.cleaning_type ?? '')
    .is('deleted_at', null)
    .maybeSingle()

  const spaceUnit = serviceItem?.unit ?? '평당'

  function formatSpaceTag(size: number | null, unit: string): string {
    if (!size) return ''
    switch (unit) {
      case '평당': return `${size}평`
      case '개':   return `${size}대`
      case '시간': return `${size}시간`
      case '정액': return ''
      default:     return `${size}평`
    }
  }

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
      spaceUnit,
    })
    db.from('quotes').update({ ai_pitch: pitch as unknown as Json }).eq('id', quoteId).then()
  }

  const tiers = [
    { tier: 'good',   label: '기본',     price: quote.good_price   ?? 0, highlight: false },
    { tier: 'better', label: '추천',     price: quote.better_price ?? 0, highlight: true  },
    { tier: 'best',   label: '프리미엄', price: quote.best_price   ?? 0, highlight: false },
  ]

  const isBooked = quote.status === 'booked'

  const expiresAt = new Date(new Date(quote.created_at).getTime() + 48 * 60 * 60 * 1000)
  const hoursLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)))
  const isExpired = !isBooked && hoursLeft === 0
  const isUrgent  = !isBooked && hoursLeft > 0 && hoursLeft <= 12

  const youtubeEmbedUrl = business.youtube_url ? getYouTubeEmbedUrl(business.youtube_url) : null

  const trustCards = [
    { emoji: '✅', title: '만족 보장',     desc: '불만족 시 3일 이내\n전면 재시공 보증' },
    { emoji: '👷', title: '직영 전담팀',   desc: `${business.name} 직영팀이\n직접 시공합니다` },
    { emoji: '🌿', title: '친환경 케미컬', desc: '영유아·반려동물에게\n안전한 제품만 사용' },
  ]

  return (
    <div className="min-h-screen bg-[#F9F8F6]">

      {/* 헤더 */}
      <header className="bg-white sticky top-0 z-10 border-b border-border">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
              {business.name.slice(0, 1)}
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{business.name}</p>
              <p className="text-[11px] text-zinc-400">맞춤 견적서</p>
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

        {/* 만료 카운트다운 */}
        {!isBooked && (
          <QuoteCountdown
            expiresAt={expiresAt.toISOString()}
            isUrgent={isUrgent}
            isExpired={isExpired}
          />
        )}

        {/* 견적 확인 카드 */}
        <div className="bg-white rounded-3xl px-5 py-5 shadow-sm">
          {quote.cleaning_type && (
            <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full mb-3">
              {quote.cleaning_type}{formatSpaceTag(quote.space_size, spaceUnit) ? ` · ${formatSpaceTag(quote.space_size, spaceUnit)}` : ''}
            </div>
          )}
          <h1 className="text-[20px] font-extrabold leading-snug text-zinc-900 break-keep">
            {pitch.headline}
          </h1>
          <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed break-keep">
            {pitch.subheadline}
          </p>

          <div className="mt-4 flex items-center gap-2 bg-[#F9F8F6] rounded-xl px-3 py-2.5">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs font-semibold text-zinc-600">
              작업 후 <span className="text-zinc-900">3일 이내 무상 재방문</span> 보증
            </p>
          </div>

          <p className="text-[11px] text-zinc-400 mt-3 leading-relaxed break-keep">
            ※ 현장 오염도·실측 면적에 따라 최종 금액이 달라질 수 있으며, 변동사항 생길 경우 현장 담당자가 안내드립니다.
          </p>
        </div>

        {/* 신뢰 보증 3종 */}
        <div className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {trustCards.map((card) => (
            <div
              key={card.title}
              className="shrink-0 w-[140px] bg-white rounded-2xl p-4 shadow-sm space-y-2"
            >
              <span className="text-2xl block">{card.emoji}</span>
              <p className="font-extrabold text-xs text-zinc-900">{card.title}</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed whitespace-pre-line break-keep">{card.desc}</p>
            </div>
          ))}
        </div>

        {/* 플랜 선택 */}
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <div className="mb-5">
            <p className="font-extrabold text-[17px] text-zinc-900">플랜을 선택하고 예약하세요</p>
            <p className="text-xs text-zinc-500 mt-0.5">3가지 플랜 모두 동일한 최고 품질로 시공됩니다</p>
          </div>

          {isBooked ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">✅</div>
              <p className="font-bold text-lg text-zinc-900">예약이 완료된 견적입니다</p>
              <p className="text-sm text-zinc-500">담당자가 곧 연락드릴 예정입니다.</p>
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

        {/* 유튜브 시공 영상 */}
        {youtubeEmbedUrl && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-zinc-500 px-1">시공 영상</p>
            <div className="overflow-hidden rounded-3xl shadow-sm" style={{ aspectRatio: '16/9' }}>
              <iframe
                src={youtubeEmbedUrl}
                title="시공 영상"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </div>
        )}

        {/* 네이버 리뷰 */}
        {business.naver_place_url && (
          <a
            href={business.naver_place_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-sm"
          >
            <div className="w-9 h-9 bg-[#03C75A] rounded-xl flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-black">N</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-0.5 mb-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[#FFB800] text-[#FFB800]" />
                ))}
              </div>
              <p className="text-xs text-zinc-500">네이버 실제 고객 리뷰 확인하기</p>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
          </a>
        )}

        {/* 하단 */}
        <div className="text-center text-xs text-zinc-400 space-y-1 pb-4">
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
