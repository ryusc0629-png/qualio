'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isApplianceService } from '@/lib/utils'

interface Service {
  id: string
  name: string
  category: string | null
  base_price: number
  unit: string
}

function serviceEmoji(category: string | null, name: string): string {
  const text = (category ?? name).toLowerCase()
  if (isApplianceService(name)) return '❄️'  // 에어컨·냉장고 등 가전 청소
  if (text.includes('입주') || text.includes('이사')) return '🏠'
  if (text.includes('정기')) return '🔄'
  if (text.includes('사무') || text.includes('오피스')) return '🏢'
  if (text.includes('주방') || text.includes('부엌')) return '🍳'
  if (text.includes('욕실') || text.includes('화장실')) return '🚿'
  if (text.includes('창문') || text.includes('유리')) return '🪟'
  if (text.includes('카펫') || text.includes('소파')) return '🛋️'
  return '✨'
}

interface Props {
  services: Service[]
  quoteUrl: string
}

export function ServiceList({ services, quoteUrl }: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = services.length > 3
  const hiddenCount = services.length - 3

  return (
    <div>
      <div className="relative">
        {/* 카드 그리드 — 접힌 상태에서 첫 행 + 2행 살짝 노출 */}
        <div
          className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-3 transition-[max-height] duration-500 ease-in-out ${
            !expanded && hasMore ? 'overflow-hidden max-h-[380px] sm:max-h-[240px] lg:max-h-[180px]' : ''
          }`}
        >
          {services.map((service) => (
            <Link
              key={service.id}
              href={quoteUrl}
              className="group flex items-center justify-between gap-4 rounded-2xl bg-slate-50 hover:bg-primary/5 border border-transparent hover:border-primary/20 p-5 transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl shrink-0 group-hover:shadow-md transition-shadow">
                  {serviceEmoji(service.category, service.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-snug">{service.name}</p>
                  {service.category && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{service.category}</p>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-semibold">견적 받기</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>

        {/* 그라디언트 페이드 + 더보기 버튼 */}
        {hasMore && !expanded && (
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white via-white/70 to-transparent flex items-end justify-center pb-3">
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-md rounded-full px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-primary/40 hover:text-primary hover:shadow-lg transition-all"
            >
              <ChevronDown className="h-4 w-4" />
              서비스 {hiddenCount}개 더보기
            </button>
          </div>
        )}

        {/* 펼쳐진 상태 — 접기 버튼 */}
        {hasMore && expanded && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp className="h-4 w-4" />
              서비스 목록 접기
            </button>
          </div>
        )}
      </div>

      {/* 맞춤 견적 CTA 박스 */}
      <div className={`rounded-2xl bg-primary/5 border border-primary/10 p-6 sm:p-8 text-center ${expanded || !hasMore ? 'mt-10' : 'mt-6'}`}>
        <p className="text-sm text-muted-foreground mb-1">같은 서비스도 집 상태에 따라 가격이 달라요</p>
        <p className="font-bold text-base mb-4">
          평수와 상태를 입력하면 <span className="text-primary">3가지 맞춤 가격</span>을 바로 비교할 수 있어요
        </p>
        <Link href={quoteUrl}>
          <Button size="lg" className="gap-2 h-12 px-8 rounded-xl font-bold shadow-md shadow-primary/20">
            내 집 맞춤 견적 받기
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <p className="text-xs text-muted-foreground mt-3">무료 · 3분 · 즉시 확인</p>
      </div>
    </div>
  )
}
