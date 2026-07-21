'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { ChevronRight, ChevronLeft, Star, MessageCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { QuoteChatWidget } from '@/components/quote/quote-chat-widget'
import { calculateAndCreateQuoteAction, createConsultationRequestAction } from '@/lib/actions/quotes'
import { getApplianceTypes, getAppliancePreset, isApplianceService, type ApplianceType } from '@/lib/utils'
import { trackFunnel } from '@/lib/utils/track-funnel'
import { trackMetaPixel } from '@/lib/utils/meta-pixel'

// 서비스 유형에 따라 스텝 분기
const STEP_SEQUENCE_DEFAULT      = ['service', 'space', 'context', 'date', 'notes', 'name', 'phone'] as const
const STEP_SEQUENCE_AC           = ['service', 'ac_detail', 'context', 'date', 'notes', 'name', 'phone'] as const
const STEP_SEQUENCE_UNIT         = ['service', 'unit_detail', 'context', 'date', 'notes', 'name', 'phone'] as const
const STEP_SEQUENCE_UNIT_VARIANT = ['service', 'unit_variant', 'unit_detail', 'context', 'date', 'notes', 'name', 'phone'] as const
// 현장 견적(상담) 서비스 — 가격 단계 없이 요청내용→이름→연락처만 받아 상담 접수
const STEP_SEQUENCE_CONSULT      = ['service', 'notes', 'name', 'phone'] as const
type Step = 'service' | 'space' | 'ac_detail' | 'unit_variant' | 'unit_detail' | 'context' | 'date' | 'notes' | 'name' | 'phone'

const SPACE_CHIPS = ['15평', '20평', '25평', '30평', '35평', '40평', '50평 이상']
const SPACE_CHIP_VALUES: Record<string, number> = {
  '15평': 15, '20평': 20, '25평': 25, '30평': 30,
  '35평': 35, '40평': 40, '50평 이상': 50,
}

const CONTEXT_OPTIONS = ['아파트', '빌라·다세대', '단독주택', '오피스텔', '상업시설·사무실']

// 에어컨·냉장고 등 가전 유형 목록은 lib/utils.ts(APPLIANCE_PRESETS)에서 서비스명으로 resolve
type AcCounts = Record<string, number>

interface ServiceItem {
  id: string
  name: string
  base_price: number
  unit: string
  ac_type_prices: Record<string, number> | null
  unit_prices: Array<{ name: string; price: number; variant?: string }> | null
  unit_variants: string[] | null
}

interface QuoteFormProps {
  businessId: string
  businessName: string
  services: ServiceItem[]
  // 견적서 알림톡이 실제 발송 가능한 상태(템플릿 설정됨)인지 — 문구를 정직하게 노출하기 위함
  quoteAlimtalkEnabled?: boolean
  // 실제 고객 후기 요약(사회적 증거) — 전환율용
  reviewSummary?: {
    count: number
    avg: number
    items: { rating: number; comment: string | null; customerName: string; createdAt: string }[]
  }
}


const DOW = ['일', '월', '화', '수', '목', '금', '토']

function formatDateLabel(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${DOW[date.getDay()]})`
}

// 가전(에어컨·냉장고 등) 유형별 수량 선택 컴포넌트 — 유형 목록(types)은 서비스별로 주입
function AcDetailSelector({
  types,
  noun,
  acTypePrices,
  onConfirm,
}: {
  types: ApplianceType[]
  noun: string
  acTypePrices: Record<string, number> | null
  onConfirm: (summary: string, totalCount: number, selections: Record<string, number>) => void
}) {
  const [counts, setCounts] = useState<AcCounts>({})

  const change = (id: string, delta: number) => {
    setCounts((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta)
      if (next === 0) {
        const { [id]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: next }
    })
  }

  const totalCount = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)

  const handleConfirm = () => {
    if (totalCount === 0) return
    const selected = types.filter((t) => (counts[t.id] ?? 0) > 0)
    const summary = selected
      .map((t) => `${t.label}${t.sub ? ` ${t.sub}` : ''} ${counts[t.id]}대`)
      .join(', ')
    const selections: Record<string, number> = {}
    for (const t of selected) selections[t.id] = counts[t.id] ?? 0
    onConfirm(summary, totalCount, selections)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {types.map((t) => {
          const count = counts[t.id] ?? 0
          return (
            <div
              key={t.id}
              className={[
                'flex items-center justify-between rounded-2xl border-2 px-4 py-3 transition-colors',
                count > 0 ? 'border-primary bg-primary/5' : 'border-border bg-[#FAFAFA]',
              ].join(' ')}
            >
              <div>
                <p className="font-semibold text-sm text-[#1A1A1A]">{t.label}</p>
                {t.sub && <p className="text-xs text-[#8D8D8D]">{t.sub}</p>}
                {acTypePrices?.[t.id] ? (
                  <p className="text-xs font-bold text-primary tabular-nums mt-0.5">
                    {acTypePrices[t.id].toLocaleString('ko-KR')}원 / 대
                  </p>
                ) : (
                  <p className="text-[11px] text-[#C0C0C0] mt-0.5">단가 미설정</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => change(t.id, -1)}
                  disabled={count === 0}
                  className="w-8 h-8 rounded-full border-2 border-border bg-white flex items-center justify-center text-[#6B6B6B] disabled:opacity-30 active:bg-slate-50 font-bold text-lg leading-none"
                >
                  −
                </button>
                <span className={['w-5 text-center font-black text-base tabular-nums', count > 0 ? 'text-primary' : 'text-[#B0B0B0]'].join(' ')}>
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => change(t.id, 1)}
                  className="w-8 h-8 rounded-full border-2 border-primary bg-primary flex items-center justify-center text-white font-bold text-lg leading-none active:opacity-80"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={totalCount === 0}
        className="w-full h-13 rounded-2xl bg-primary disabled:opacity-30 text-white font-bold text-sm transition-opacity py-3.5"
      >
        {totalCount > 0 ? `총 ${totalCount}대 선택 완료 →` : `${noun} 1대 이상 선택해주세요`}
      </button>
    </div>
  )
}

// 항목별 수량 선택 컴포넌트 (줄눌·화장실청소 등)
function UnitDetailSelector({
  unitPrices,
  onConfirm,
}: {
  unitPrices: Array<{ name: string; price: number }>
  onConfirm: (summary: string, selections: Record<string, number>) => void
}) {
  const [counts, setCounts] = useState<Record<string, number>>({})

  const change = (name: string, delta: number) => {
    setCounts((prev) => {
      const next = Math.max(0, (prev[name] ?? 0) + delta)
      if (next === 0) {
        const { [name]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [name]: next }
    })
  }

  const total = unitPrices.reduce((sum, item) => sum + item.price * (counts[item.name] ?? 0), 0)
  const hasSelection = Object.values(counts).some((c) => c > 0)

  const handleConfirm = () => {
    if (!hasSelection) return
    const summary = unitPrices
      .filter((item) => (counts[item.name] ?? 0) > 0)
      .map((item) => `${item.name} ${counts[item.name]}곳`)
      .join(', ')
    onConfirm(summary, counts)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {unitPrices.map((item) => {
          const count = counts[item.name] ?? 0
          return (
            <div
              key={item.name}
              className={[
                'flex items-center justify-between rounded-2xl border-2 px-4 py-3 transition-colors',
                count > 0 ? 'border-primary bg-primary/5' : 'border-border bg-[#FAFAFA]',
              ].join(' ')}
            >
              <div>
                <p className="font-semibold text-sm text-[#1A1A1A]">{item.name}</p>
                <p className="text-xs font-bold text-primary tabular-nums mt-0.5">
                  {item.price.toLocaleString('ko-KR')}원 / 곳
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => change(item.name, -1)}
                  disabled={count === 0}
                  className="w-8 h-8 rounded-full border-2 border-border bg-white flex items-center justify-center text-[#6B6B6B] disabled:opacity-30 active:bg-slate-50 font-bold text-lg leading-none"
                >
                  −
                </button>
                <span className={['w-5 text-center font-black text-base tabular-nums', count > 0 ? 'text-primary' : 'text-[#B0B0B0]'].join(' ')}>
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => change(item.name, 1)}
                  className="w-8 h-8 rounded-full border-2 border-primary bg-primary flex items-center justify-center text-white font-bold text-lg leading-none active:opacity-80"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {hasSelection && (
        <p className="text-center text-sm font-bold text-primary tabular-nums">
          예상 금액 {total.toLocaleString('ko-KR')}원
        </p>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!hasSelection}
        className="w-full h-13 rounded-2xl bg-primary disabled:opacity-30 text-white font-bold text-sm transition-opacity py-3.5"
      >
        {hasSelection ? `선택 완료 →` : '항목을 1개 이상 선택해주세요'}
      </button>
    </div>
  )
}

function InlineCalendar({ onSelect }: { onSelect: (label: string, value: string) => void }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewYear, setViewYear]   = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selected, setSelected]   = useState<Date | null>(null)

  // 최대 6개월 뒤까지 (입주청소 3달 전 예약 커버)
  const maxDate = new Date(today)
  maxDate.setMonth(maxDate.getMonth() + 6)

  const canGoPrev = !(viewYear === today.getFullYear() && viewMonth === today.getMonth())
  const canGoNext = !(viewYear === maxDate.getFullYear() && viewMonth === maxDate.getMonth())

  const prevMonth = useCallback(() => {
    if (!canGoPrev) return
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }, [canGoPrev, viewMonth])

  const nextMonth = useCallback(() => {
    if (!canGoNext) return
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }, [canGoNext, viewMonth])

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const handleDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    if (d < today) return
    setSelected(d)
  }

  const handleConfirm = () => {
    if (!selected) return
    onSelect(formatDateLabel(selected), selected.toISOString().split('T')[0])
  }

  return (
    <div className="space-y-2">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#6B6B6B] disabled:opacity-20 active:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-bold text-sm text-[#1A1A1A]">{viewYear}년 {viewMonth + 1}월</p>
        <button
          type="button"
          onClick={nextMonth}
          disabled={!canGoNext}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#6B6B6B] disabled:opacity-20 active:bg-slate-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 text-center">
        {DOW.map((d, i) => (
          <p key={d} className={[
            'text-[11px] font-semibold py-1',
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-[#B0B0B0]',
          ].join(' ')}>
            {d}
          </p>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const date   = new Date(viewYear, viewMonth, day)
          const isPast = date < today
          const isToday    = date.getTime() === today.getTime()
          const isSelected = selected?.getTime() === date.getTime()
          const isSun = date.getDay() === 0
          const isSat = date.getDay() === 6

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleDay(day)}
              disabled={isPast}
              className={[
                'mx-auto w-9 h-9 rounded-full text-sm flex items-center justify-center transition-colors font-medium',
                isPast      ? 'text-[#D4D4D4] cursor-default' :
                isSelected  ? 'bg-primary text-white font-bold' :
                isToday     ? 'border-2 border-primary text-primary font-bold' :
                isSun       ? 'text-red-400 active:bg-[#FFF0F0]' :
                isSat       ? 'text-blue-400 active:bg-[#F0F5FF]' :
                              'text-[#1A1A1A] active:bg-slate-50',
              ].join(' ')}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* 확인 버튼 */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!selected}
        className="w-full h-12 rounded-2xl bg-primary disabled:opacity-30 text-white font-bold text-sm transition-opacity mt-1"
      >
        {selected ? `${formatDateLabel(selected)} 선택하기` : '날짜를 선택해주세요'}
      </button>

      {/* 미정 */}
      <button
        type="button"
        onClick={() => onSelect('날짜 미정', '')}
        className="w-full h-9 text-xs font-semibold text-[#B0B0B0]"
      >
        아직 미정이에요
      </button>
    </div>
  )
}

function BotBubble({ text, initial }: { text: string; initial: string }) {
  return (
    <div className="flex items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0 mb-0.5">
        {initial}
      </div>
      <div className="max-w-[78%] bg-white rounded-3xl rounded-bl-lg px-4 py-3 shadow-sm">
        <p className="text-sm text-[#1A1A1A] font-medium leading-relaxed break-keep whitespace-pre-line">{text}</p>
      </div>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="max-w-[70%] bg-primary rounded-3xl rounded-br-lg px-4 py-3 shadow-sm">
        <p className="text-sm text-white font-semibold break-keep">{text}</p>
      </div>
    </div>
  )
}

function TypingBubble({ initial }: { initial: string }) {
  return (
    <div className="flex items-end gap-2 animate-in fade-in duration-200">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0 mb-0.5">
        {initial}
      </div>
      <div className="bg-white rounded-3xl rounded-bl-lg px-4 py-3.5 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C0B8B0] animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#C0B8B0] animate-bounce [animation-delay:160ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#C0B8B0] animate-bounce [animation-delay:320ms]" />
        </div>
      </div>
    </div>
  )
}

// 견적 계산 중 — '열심히 만드는 중' 느낌을 주는 생생한 로딩 카드.
// 상태 메시지를 순차로 넘기고(펄스 스파클·통통 튀는 점·차오르는 진행바), 실제 계산이
// 끝나면 상위에서 언마운트된다. 정적 문구가 멈춘 듯 보이던 문제 해결.
function QuoteCalculatingBubble({ initial, steps }: { initial: string; steps: string[] }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (idx >= steps.length - 1) return // 마지막 메시지에서 멈춰 대기
    const t = setTimeout(() => setIdx((i) => i + 1), 650)
    return () => clearTimeout(t)
  }, [idx, steps.length])

  const pct = Math.round(((idx + 1) / steps.length) * 100)

  return (
    <div className="flex items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0 mb-0.5">
        {initial}
      </div>
      <div className="max-w-[85%] w-full bg-white rounded-3xl rounded-bl-lg px-4 py-4 shadow-sm space-y-3">
        {/* 헤더 — 펄스 스파클 + 제목 */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-5 w-5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/30 animate-ping" />
            <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px]">✨</span>
          </span>
          <p className="text-sm font-bold text-[#1A1A1A]">맞춤 견적서를 만들고 있어요</p>
        </div>

        {/* 순환 상태 메시지 — 통통 튀는 점 + 페이드 전환 */}
        <div className="flex items-center gap-2 min-h-[20px]">
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:160ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:320ms]" />
          </span>
          <p key={idx} className="text-sm text-[#5A5A5A] break-keep animate-in fade-in slide-in-from-bottom-1 duration-300">
            {steps[idx]}
          </p>
        </div>

        {/* 차오르는 진행바 */}
        <div className="h-1.5 w-full bg-[#EFEFEF] rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function QuoteForm({ businessId, businessName, services, reviewSummary, quoteAlimtalkEnabled = false }: QuoteFormProps) {
  const [currentStep, setCurrentStep] = useState<Step>('service')
  const [completedSteps, setCompletedSteps] = useState<Step[]>([])
  const [isTyping, setIsTyping] = useState(false)

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedServiceName, setSelectedServiceName] = useState('')
  const [isAcMode, setIsAcMode] = useState(false)
  const [isUnitMode, setIsUnitMode] = useState(false)
  const [isConsultMode, setIsConsultMode] = useState(false) // 현장 견적(상담) 서비스 여부
  const [consultDone, setConsultDone] = useState(false)      // 상담요청 접수 완료
  const [acSummary, setAcSummary] = useState('')
  const [acTotalCount, setAcTotalCount] = useState(0)
  const [acSelections, setAcSelections] = useState<Record<string, number>>({})
  const [acTypePrices, setAcTypePrices] = useState<Record<string, number> | null>(null)
  // 선택된 가전 서비스의 유형 목록 + 명사(에어컨/냉장고 등) — 서비스명으로 resolve
  const [acTypes, setAcTypes] = useState<ApplianceType[]>([])
  const [acNoun, setAcNoun] = useState('에어컨')
  const [unitPrices, setUnitPrices] = useState<Array<{ name: string; price: number; variant?: string }> | null>(null)
  const [unitVariants, setUnitVariants] = useState<string[] | null>(null)
  const [selectedUnitVariant, setSelectedUnitVariant] = useState<string | null>(null)
  const [unitSummary, setUnitSummary] = useState('')
  const [unitSelections, setUnitSelections] = useState<Record<string, number>>({})
  const [spaceSize, setSpaceSize] = useState('')
  const [customSpace, setCustomSpace] = useState('')
  const [contextAnswer, setContextAnswer] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredDateLabel, setPreferredDateLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  // 현재 서비스에 맞는 스텝 순서
  const stepSequence = isConsultMode
    ? STEP_SEQUENCE_CONSULT
    : isAcMode
      ? STEP_SEQUENCE_AC
      : isUnitMode
        ? (unitVariants && unitVariants.length > 0 ? STEP_SEQUENCE_UNIT_VARIANT : STEP_SEQUENCE_UNIT)
        : STEP_SEQUENCE_DEFAULT

  const chatEndRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false) // 폼 시작(form_started) 1회만 기록
  const submitStartRef = useRef(0) // 제출 시각 — 계산 애니메이션 최소 노출 시간 계산용
  const [finalizing, setFinalizing] = useState(false) // 제출~결과이동 사이 로딩 연속 유지(깜빡임 방지)
  const [chatOpen, setChatOpen] = useState(false) // 헤더 '문의' 버튼으로 여는 상담창

  // 단계 이동·타이핑·계산 시작(finalizing) 때마다 맨 아래로 스크롤 —
  // 계산 로딩 카드가 화면 밖에 생기지 않고 항상 눈앞에 보이도록 유도
  useEffect(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 50)
  }, [currentStep, isTyping, finalizing])

  const { execute, isPending } = useAction(calculateAndCreateQuoteAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      // 견적 제출 완료 기록(이동 전 sendBeacon). quoteId를 함께 남겨 예약→세션→채널 매출 연결
      trackFunnel(businessId, 'quote_submitted', { meta: { quoteId: data.quoteId } })
      // Meta 픽셀 핵심 전환 — 광고 최적화가 '견적 완료'를 목표로 삼게
      trackMetaPixel('CompleteRegistration')
      // 계산 애니메이션이 '휙' 지나가지 않도록 최소 1.6초는 보여준 뒤 이동(신뢰감·기대감)
      const elapsed = Date.now() - submitStartRef.current
      setTimeout(
        () => window.location.replace(`/q/${businessId}/quote/${data.quoteId}`),
        Math.max(0, 1600 - elapsed),
      )
    },
    onError: ({ error }) => {
      setFinalizing(false)
      toast.error(error.serverError ?? '견적 계산에 실패했습니다')
    },
  })

  // 제출 시작~결과 이동까지 연속으로 로딩을 보여주는 플래그(isPending은 액션 완료 순간 꺼져 깜빡임 발생)
  const calculating = isPending || finalizing

  // 현장 견적(상담) 접수 액션
  const { execute: executeConsult, isPending: isConsultPending } = useAction(createConsultationRequestAction, {
    onSuccess: () => {
      trackFunnel(businessId, 'quote_submitted', { meta: { consult: 1 } })
      // Meta 픽셀 — 상담(현장 견적) 접수는 Contact 전환으로
      trackMetaPixel('Contact')
      setConsultDone(true)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '접수에 실패했어요. 다시 시도해주세요'),
  })

  const initial = businessName.slice(0, 1)
  const progressPct = (completedSteps.length / stepSequence.length) * 100

  const getQuestion = (step: Step): string => {
    switch (step) {
      case 'service':   return '안녕하세요! 어떤 청소 서비스가 필요하신가요?'
      case 'space':     return '공간이 몇 평인가요?'
      case 'ac_detail':     return `${acNoun} 유형과 대수를 알려주세요`
      case 'unit_variant':  return '해당되는 구분을 선택해주세요'
      case 'unit_detail':   return '항목별 수량을 선택해주세요'
      case 'context':   return '주거 형태가 어떻게 되세요?'
      case 'date':      return '언제 방문해 드릴까요?'
      case 'notes':     return isConsultMode ? '어떤 작업이 필요하신가요? 편하게 적어주세요' : '특별히 신경 써드릴 부분이 있나요?'
      case 'name':      return '성함이 어떻게 되세요?'
      case 'phone':
        if (isConsultMode) return '사장님이 방문 견적을 위해 연락드릴게요 📞\n연락처를 알려주세요'
        // 알림톡 발송이 켜져 있으면 "카톡으로 보내드릴게요", 아니면 화면에 바로 보여주고 사장님이 확인하는 정직한 안내
        return quoteAlimtalkEnabled
          ? '카카오톡으로 견적서를 보내드릴게요 📱\n연락처를 알려주세요'
          : '견적 결과를 바로 보여드릴게요 📱\n연락처를 남겨주시면 사장님이 확인해요'
    }
  }

  const getAnswerDisplay = (step: Step): string => {
    switch (step) {
      case 'service':   return selectedServiceName
      case 'space':     return `${spaceSize}평`
      case 'ac_detail':     return acSummary
      case 'unit_variant':  return selectedUnitVariant ?? ''
      case 'unit_detail':   return unitSummary
      case 'context':   return contextAnswer
      case 'date':      return preferredDateLabel
      case 'notes':     return notes.trim() || '특별 요청 없음'
      case 'name':      return customerName
      case 'phone':     return customerPhone
    }
  }

  const advance = (from: Step, to: Step) => {
    // 첫 단계 완료 = 폼 시작 (1회만), 이후 각 단계 완료를 기록 → 이탈 지점 파악
    if (!startedRef.current) {
      startedRef.current = true
      trackFunnel(businessId, 'form_started')
      // Meta 픽셀 — 견적 폼 시작을 Lead로(전환 희소 초기에 Meta에 이른 신호 제공)
      trackMetaPixel('Lead')
    }
    trackFunnel(businessId, 'step_completed', { step: from })
    setCompletedSteps(prev => [...prev, from])
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setCurrentStep(to)
    }, 400)
  }

  const handleServiceSelect = (service: ServiceItem) => {
    const isConsult = service.unit === '상담' // 현장 방문 후 견적 서비스
    const isAc   = !isConsult && isApplianceService(service.name)
    const isUnit = !isConsult && !isAc && Array.isArray(service.unit_prices) && service.unit_prices.length > 0
    const hasVariants = isUnit && Array.isArray(service.unit_variants) && service.unit_variants.length > 0
    setSelectedServiceId(service.id)
    setSelectedServiceName(service.name)
    setIsConsultMode(isConsult)
    setIsAcMode(isAc)
    setIsUnitMode(isUnit)
    // 가전 유형 목록·명사 resolve (에어컨/냉장고 등)
    setAcTypes(getApplianceTypes(service.name) ?? [])
    setAcNoun(getAppliancePreset(service.name)?.noun ?? '유형')
    setAcTypePrices(service.ac_type_prices)
    setUnitPrices(isUnit ? service.unit_prices : null)
    setUnitVariants(hasVariants ? (service.unit_variants as string[]) : null)
    setSelectedUnitVariant(null)
    // 상담 서비스는 가격 단계 건너뛰고 요청내용(notes)부터
    const nextStep = isConsult
      ? 'notes'
      : isAc ? 'ac_detail' : isUnit ? (hasVariants ? 'unit_variant' : 'unit_detail') : 'space'
    setTimeout(() => advance('service', nextStep), 50)
  }

  const handleUnitVariantSelect = (variant: string) => {
    setSelectedUnitVariant(variant)
    setTimeout(() => advance('unit_variant', 'unit_detail'), 50)
  }

  const handleAcDetail = (summary: string, totalCount: number, selections: Record<string, number>) => {
    setAcSummary(summary)
    setAcTotalCount(totalCount)
    setAcSelections(selections)
    setTimeout(() => advance('ac_detail', 'context'), 50)
  }

  const handleUnitDetail = (summary: string, selections: Record<string, number>) => {
    setUnitSummary(summary)
    setUnitSelections(selections)
    setTimeout(() => advance('unit_detail', 'context'), 50)
  }

  const handleSpaceChip = (chip: string) => {
    setSpaceSize(String(SPACE_CHIP_VALUES[chip]))
    setTimeout(() => advance('space', 'context'), 50)
  }

  const handleSpaceCustom = () => {
    const val = Number(customSpace)
    if (!val || val < 1) return
    setSpaceSize(customSpace)
    advance('space', 'context')
  }

  const handleContextSelect = (option: string) => {
    setContextAnswer(option)
    setTimeout(() => advance('context', 'date'), 50)
  }

  const handleDateSelect = (label: string, value: string) => {
    setPreferredDateLabel(label)
    setPreferredDate(value)
    setTimeout(() => advance('date', 'notes'), 50)
  }

  const handleNotes = (skip?: boolean) => {
    if (skip) setNotes('')
    advance('notes', 'name')
  }

  const handleName = () => {
    if (customerName.trim().length < 2) return
    advance('name', 'phone')
  }

  const handleSubmit = () => {
    const phoneRegex = /^(010|011|016|017|018|019|02|0[3-9]\d)\d{7,8}$/
    const clean = customerPhone.replace(/-/g, '')
    if (!phoneRegex.test(clean)) {
      toast.error('올바른 전화번호를 입력해주세요 (예: 01012345678)')
      return
    }

    // 현장 견적(상담) 서비스: 가격 계산 없이 상담 요청으로 접수
    if (isConsultMode) {
      executeConsult({
        business_id:    businessId,
        service_id:     selectedServiceId,
        customer_name:  customerName.trim(),
        customer_phone: clean,
        notes:          notes.trim() || undefined,
      })
      return
    }

    // 컨텍스트 + 에어컨 상세 + 요청사항 합산
    const combinedNotes = [
      contextAnswer ? `주거형태: ${contextAnswer}` : '',
      isAcMode && acSummary ? `${acNoun}: ${acSummary}` : '',
      notes.trim(),
    ].filter(Boolean).join(' | ')

    submitStartRef.current = Date.now()
    setFinalizing(true) // 즉시 로딩 표시(액션 pending 이전부터 켜 깜빡임 방지)
    execute({
      business_id:    businessId,
      service_id:     selectedServiceId,
      space_size:     isAcMode ? acTotalCount : isUnitMode ? 0 : Number(spaceSize),
      preferred_date: preferredDate || undefined,
      extra_notes:    combinedNotes || undefined,
      customer_name:  customerName.trim(),
      customer_phone: clean,
      ac_selections:   isAcMode   && Object.keys(acSelections).length   > 0 ? acSelections   : undefined,
      unit_selections: isUnitMode && Object.keys(unitSelections).length > 0 ? unitSelections : undefined,
      unit_variant:    selectedUnitVariant ?? undefined,
    })
  }

  // 상담 요청 접수 완료 화면 (현장 견적 서비스)
  if (consultDone) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-3xl mb-4">
          ✅
        </div>
        <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">상담 요청이 접수됐어요!</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {businessName} 사장님이 남겨주신 연락처로<br />
          곧 연락드려 방문 견적을 잡아드릴게요.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* 상단 헤더 */}
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-[#1A1A1A] leading-tight truncate">{businessName}</p>
              <p className="text-[11px] text-[#8D8D8D]">견적 문의</p>
            </div>
          </div>
          {/* 진행 바 + 단계 수치 + 상담 버튼 */}
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-[11px] text-zinc-400 tabular-nums shrink-0">
              {completedSteps.length}/{stepSequence.length}
            </p>
            <div className="w-12 sm:w-20 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {/* 궁금한 점 상담 — 화면을 안 가리도록 헤더에 고정 */}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 h-8 pl-2 pr-2.5 text-xs font-semibold text-emerald-700 active:scale-95 transition-transform shrink-0"
              aria-label="상담 시작하기"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              물어보기
            </button>
          </div>
        </div>
      </header>

      {/* 사회적 증거 — 실제 후기 평균 별점·개수 (신뢰 → 전환율↑). 후기 있을 때만 */}
      {reviewSummary && reviewSummary.count > 0 && (
        <div className="bg-white border-b border-border">
          <div className="max-w-md mx-auto px-4 py-2 flex items-center gap-2">
            <div className="flex items-center gap-0.5 shrink-0">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`h-3.5 w-3.5 ${n <= Math.round(reviewSummary.avg) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                />
              ))}
            </div>
            <span className="text-xs font-semibold text-[#1A1A1A]">{reviewSummary.avg.toFixed(1)}</span>
            <span className="text-xs text-[#8D8D8D]">실제 후기 {reviewSummary.count}개</span>
            {reviewSummary.items[0]?.comment && (
              <span className="text-xs text-[#8D8D8D] truncate">· &ldquo;{reviewSummary.items[0].comment}&rdquo;</span>
            )}
          </div>
        </div>
      )}

      {/* 채팅 스레드 — 카카오톡처럼 메시지가 하단부터 쌓임 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col justify-end">
        <div className="max-w-md mx-auto w-full space-y-3 pt-4">

          {completedSteps.map((step) => (
            <div key={step} className="space-y-2">
              <BotBubble text={getQuestion(step)} initial={initial} />
              <UserBubble text={getAnswerDisplay(step)} />
            </div>
          ))}

          {/* 제출 중 — 연락처 답변 + 생생한 계산 애니메이션 */}
          {calculating && (
            <div className="space-y-2">
              <BotBubble text={getQuestion('phone')} initial={initial} />
              <UserBubble text={customerPhone} />
              <QuoteCalculatingBubble
                initial={initial}
                steps={[
                  '입력하신 내용을 확인하고 있어요',
                  spaceSize
                    ? `${selectedServiceName} · ${spaceSize}평 기준으로 계산하고 있어요`
                    : `${selectedServiceName} 기준으로 계산하고 있어요`,
                  '가장 합리적인 3단계 가격을 맞추고 있어요',
                  '거의 다 됐어요, 곧 보여드릴게요',
                ]}
              />
            </div>
          )}

          {/* 타이핑 중 또는 현재 질문 */}
          {!calculating && (
            isTyping
              ? <TypingBubble initial={initial} />
              : <BotBubble text={getQuestion(currentStep)} initial={initial} />
          )}

          <div ref={chatEndRef} className="h-1" />
        </div>
      </div>

      {/* 입력 영역 — 항상 하단 고정 */}
      <div className="sticky bottom-0 bg-white border-t border-border px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto space-y-3">

          {/* 타이핑/처리 중엔 입력 영역 숨김 */}
          {(isTyping || calculating) && (
            <div className="h-12 flex items-center justify-center">
              <p className="text-xs text-[#B0B0B0]">
                {calculating ? '견적서를 만들고 있어요...' : '답변을 입력하고 있어요...'}
              </p>
            </div>
          )}

          {/* 서비스 선택 */}
          {!isTyping && !calculating && currentStep === 'service' && (
            services.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {services.map((s) => {
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleServiceSelect(s)}
                      className="text-left px-4 py-3.5 rounded-2xl border-2 border-border bg-[#FAFAFA] active:bg-primary/10 active:border-primary transition-colors"
                    >
                      <p className="font-semibold text-sm text-[#1A1A1A]">{s.name}</p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-[#8D8D8D] text-center py-4">등록된 서비스가 없습니다</p>
            )
          )}

          {/* 에어컨 유형·대수 선택 */}
          {!isTyping && !calculating && currentStep === 'ac_detail' && (
            <AcDetailSelector types={acTypes} noun={acNoun} acTypePrices={acTypePrices} onConfirm={handleAcDetail} />
          )}

          {/* 구분 선택 (신축/구축 등) */}
          {!isTyping && !calculating && currentStep === 'unit_variant' && unitVariants && (
            <div className="flex flex-wrap gap-2">
              {unitVariants.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleUnitVariantSelect(v)}
                  className="px-5 py-3 rounded-2xl border-2 border-border bg-[#FAFAFA] text-sm font-semibold text-[#1A1A1A] active:bg-primary/10 active:border-primary transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* 항목별 수량 선택 (줄눌 시공 등) */}
          {!isTyping && !calculating && currentStep === 'unit_detail' && unitPrices && (() => {
            // variant가 선택된 경우 해당 항목만 필터링
            const filteredPrices = selectedUnitVariant
              ? unitPrices.filter((item) => item.variant === selectedUnitVariant)
              : unitPrices.filter((item) => !item.variant)
            return <UnitDetailSelector unitPrices={filteredPrices} onConfirm={handleUnitDetail} />
          })()}

          {/* 평수 선택 */}
          {!isTyping && !calculating && currentStep === 'space' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {SPACE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSpaceChip(chip)}
                    className="px-4 py-2.5 rounded-full border-2 border-border bg-[#FAFAFA] text-sm font-semibold text-[#1A1A1A] active:bg-primary/10 active:border-primary transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="직접 입력 (예: 33)"
                  value={customSpace}
                  onChange={(e) => setCustomSpace(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSpaceCustom()}
                  className="h-12 rounded-2xl border-border"
                />
                <button
                  type="button"
                  onClick={handleSpaceCustom}
                  disabled={!customSpace}
                  className="shrink-0 w-12 h-12 rounded-2xl bg-primary disabled:opacity-40 flex items-center justify-center transition-opacity"
                >
                  <ChevronRight className="h-5 w-5 text-white" />
                </button>
              </div>
            </div>
          )}

          {/* 주거 형태 선택 */}
          {!isTyping && !calculating && currentStep === 'context' && (
            <div className="grid grid-cols-2 gap-2">
              {CONTEXT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleContextSelect(option)}
                  className="text-left px-4 py-3.5 rounded-2xl border-2 border-border bg-[#FAFAFA] font-semibold text-sm text-[#1A1A1A] active:bg-primary/10 active:border-primary transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {/* 희망 날짜 선택 — 인라인 달력 */}
          {!isTyping && !calculating && currentStep === 'date' && (
            <InlineCalendar onSelect={handleDateSelect} />
          )}

          {/* 요청사항 */}
          {!isTyping && !calculating && currentStep === 'notes' && (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="예) 에어컨 포함, 주방 기름때 심함, 반려동물 있음"
                rows={3}
                autoFocus
                className="w-full rounded-2xl border border-border bg-[#FAFAFA] px-4 py-3 text-base md:text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleNotes(true)}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-[#8D8D8D] active:bg-slate-50 transition-colors"
                >
                  없어요, 건너뛸게요
                </button>
                <button
                  type="button"
                  onClick={() => handleNotes(false)}
                  disabled={!notes.trim()}
                  className="flex-1 h-12 rounded-2xl bg-primary disabled:opacity-40 text-white font-bold text-sm transition-opacity"
                >
                  다음으로 →
                </button>
              </div>
            </div>
          )}

          {/* 이름 */}
          {!isTyping && !calculating && currentStep === 'name' && (
            <div className="flex gap-2">
              <Input
                placeholder="홍길동"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleName()}
                autoFocus
                className="h-12 rounded-2xl border-border"
              />
              <button
                type="button"
                onClick={handleName}
                disabled={customerName.trim().length < 2}
                className="shrink-0 w-12 h-12 rounded-2xl bg-primary disabled:opacity-40 flex items-center justify-center transition-opacity"
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
            </div>
          )}

          {/* 연락처 + 최종 제출 */}
          {!isTyping && !calculating && currentStep === 'phone' && (
            <div className="space-y-2">
              <Input
                placeholder="01012345678"
                inputMode="numeric"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoFocus
                className="h-12 rounded-2xl border-border"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={calculating || isConsultPending || customerPhone.length < 10}
                className="w-full h-14 rounded-2xl bg-primary text-white font-extrabold text-base disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {isConsultMode ? '상담 요청 보내기 →' : '내 견적서 바로 받기 →'}
              </button>
              <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                🔒 전화번호는 예약 확인에만 사용돼요. 광고 문자는 보내지 않습니다.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* 상담창 — 헤더 '문의' 버튼으로 열림(전체화면). 화면을 상시 가리지 않도록 떠다니는 버튼은 두지 않음 */}
      <QuoteChatWidget
        businessId={businessId}
        businessName={businessName}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </div>
  )
}
