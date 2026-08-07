'use client'

import { useRef, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Send, MessageCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { QuoteChatWidget } from '@/components/quote/quote-chat-widget'
import { calculateAndCreateQuoteAction, createConsultationRequestAction } from '@/lib/actions/quotes'
import { trackFunnel } from '@/lib/utils/track-funnel'
import { trackMetaPixel } from '@/lib/utils/meta-pixel'
import { isBusinessService } from '@/lib/utils'

// 랜딩 히어로에 넣는 서비스 정보 — 견적 자동계산 가능 여부 판별에 필요한 최소 필드
export interface HeroFormService {
  id: string
  name: string
  base_price: number
  unit: string
  ac_type_prices: Record<string, number> | null
  unit_prices: Array<{ name: string; price: number; variant?: string }> | null
  unit_variants: string[] | null
}

interface Props {
  businessId: string
  businessName: string
  services: HeroFormService[]
  // 유입 채널(?ch=) — 이 랜딩으로 데려온 홍보 채널. 문의/견적 오더에 그대로 도장 찍는다.
  channel?: string | null
}

// 평수(평당)·개수(개) 서비스는 규모 입력이 필요
function needsSize(s: HeroFormService): boolean {
  return s.unit === '평당' || s.unit === '개'
}

// 가전(유형·대수)·항목별·구분(신축/구축)·상담형은 폼만으로 정확한 자동견적이 어려움 → 상담 접수로 처리
function isConsultType(s: HeroFormService): boolean {
  return (
    s.unit === '상담' ||
    (!!s.ac_type_prices && Object.keys(s.ac_type_prices).length > 0) ||
    (Array.isArray(s.unit_prices) && s.unit_prices.length > 0) ||
    (Array.isArray(s.unit_variants) && s.unit_variants.length > 0)
  )
}

export function HeroLeadForm({ businessId, businessName, services, channel }: Props) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [size, setSize] = useState('')
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<'quote' | 'consult' | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const startedRef = useRef(false)

  const selected = services.find((s) => s.id === serviceId)
  const consultMode = selected ? isConsultType(selected) : false
  const sizeMode = selected ? needsSize(selected) : false
  const sizeLabel = selected?.unit === '개' ? '개수' : '평수'
  // 정기청소·업무공간(사무실·상가·공장·병원 등) B2B 서비스는 회사명을 함께 받는다
  const businessMode = selected ? isBusinessService(selected.name) : false

  const quoteAction = useAction(calculateAndCreateQuoteAction, {
    onSuccess: () => {
      trackFunnel(businessId, 'quote_submitted')
      trackMetaPixel('CompleteRegistration')
      setResult('quote')
    },
    onError: () => toast.error('견적을 못 보냈어요. 잠시 후 다시 눌러주세요'),
  })

  const consultAction = useAction(createConsultationRequestAction, {
    onSuccess: () => {
      trackFunnel(businessId, 'quote_submitted', { meta: { consult: 1 } })
      trackMetaPixel('Contact')
      setResult('consult')
    },
    onError: () => toast.error('접수를 못 했어요. 잠시 후 다시 눌러주세요'),
  })

  const isPending = quoteAction.isPending || consultAction.isPending

  // 첫 입력 시 1회만 퍼널 시작 이벤트 기록
  function markStarted() {
    if (startedRef.current) return
    startedRef.current = true
    trackFunnel(businessId, 'form_started')
    trackMetaPixel('Lead')
  }

  function reset() {
    setResult(null)
    setSize('')
    setCompany('')
    setName('')
    setPhone('')
    startedRef.current = false
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) {
      toast.error('서비스를 선택해주세요')
      return
    }
    const trimmedName = name.trim()
    const trimmedCompany = company.trim()
    const phoneDigits = phone.replace(/[^0-9]/g, '')
    if (businessMode && trimmedCompany.length < 1) {
      toast.error('회사명(상호)을 입력해주세요')
      return
    }
    if (trimmedName.length < 2) {
      toast.error('성함을 입력해주세요')
      return
    }
    if (phoneDigits.length < 10) {
      toast.error('연락처를 정확히 입력해주세요 (예: 01012345678)')
      return
    }
    if (sizeMode && !consultMode && (!size || Number(size) < 1)) {
      toast.error(`${sizeLabel}를 입력해주세요 (예: 30)`)
      return
    }

    if (consultMode) {
      consultAction.execute({
        business_id: businessId,
        service_id: selected.id,
        customer_name: trimmedName,
        customer_phone: phoneDigits,
        company_name: businessMode ? trimmedCompany : undefined,
        channel: channel ?? undefined,
      })
    } else {
      quoteAction.execute({
        business_id: businessId,
        service_id: selected.id,
        space_size: sizeMode ? Number(size) : undefined,
        customer_name: trimmedName,
        customer_phone: phoneDigits,
        company_name: businessMode ? trimmedCompany : undefined,
        channel: channel ?? undefined,
      })
    }
  }

  // ── 제출 완료 화면 ──
  if (result) {
    return (
      <div className="w-full max-w-md mx-auto rounded-2xl bg-white p-6 shadow-xl text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
        {result === 'quote' ? (
          <>
            <h3 className="text-lg font-bold text-slate-900">견적 신청이 접수됐어요! ✅</h3>
            <p className="text-sm text-slate-600">
              {name.trim()}님, 맞춤 견적을 준비해서<br />
              곧 {businessName}에서 연락드릴게요.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900">신청이 접수됐어요! ✅</h3>
            <p className="text-sm text-slate-600">
              곧 {businessName}에서<br />
              연락드릴게요.
            </p>
          </>
        )}
        <Button variant="outline" className="h-12 w-full" onClick={reset}>
          다시 견적 받기
        </Button>
        <QuoteChatWidget
          businessId={businessId}
          businessName={businessName}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />
      </div>
    )
  }

  // ── 입력 폼 ──
  return (
    <div className="w-full max-w-md mx-auto">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-5 shadow-xl text-left space-y-3"
      >
        <p className="text-center text-sm font-bold text-slate-900">
          30초면 끝! 무료 견적 받아보기
        </p>

        {/* 서비스 선택 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">어떤 청소가 필요하세요? (필수)</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            onFocus={markStarted}
            className="w-full h-12 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* 규모(평수/개수) — 해당 서비스에만 노출 */}
        {sizeMode && !consultMode && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">{sizeLabel} (필수)</label>
            <Input
              type="text"
              inputMode="numeric"
              value={size}
              onChange={(e) => setSize(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={markStarted}
              placeholder={selected?.unit === '개' ? '예: 3' : '예: 30'}
              className="h-12"
            />
          </div>
        )}

        {/* 회사명(상호) — 정기청소·업무공간 등 B2B 서비스에만 노출 */}
        {businessMode && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">회사명 (필수)</label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onFocus={markStarted}
              placeholder="예: (주)퀄리오 / 강남점"
              className="h-12"
            />
          </div>
        )}

        {/* 이름 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">
            {businessMode ? '담당자 성함 (필수)' : '성함 (필수)'}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={markStarted}
            placeholder="예: 홍길동"
            className="h-12"
          />
        </div>

        {/* 연락처 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">연락처 (필수)</label>
          <Input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onFocus={markStarted}
            placeholder="예: 010-1234-5678"
            className="h-12"
          />
        </div>

        <Button type="submit" disabled={isPending} className="h-12 w-full gap-2 text-base font-bold">
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />보내는 중...</>
          ) : (
            <><Send className="h-4 w-4" />{consultMode ? '상담 신청하기' : '무료 견적 신청하기'}</>
          )}
        </Button>

        <p className="text-center text-[11px] text-slate-400">
          입력하신 연락처로 {businessName}에서 바로 연락드려요
        </p>
      </form>

      {/* 실시간 상담(전문가 자동 상담) 보조 진입점 */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="mt-3 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow hover:bg-white transition-colors"
      >
        <MessageCircle className="h-4 w-4 text-primary" />
        급하세요? 실시간으로 상담받기
      </button>

      <QuoteChatWidget
        businessId={businessId}
        businessName={businessName}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </div>
  )
}
