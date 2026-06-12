'use client'

import { useState, useEffect, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { calculateAndCreateQuoteAction } from '@/lib/actions/quotes'

const STEPS = ['service', 'space', 'notes', 'name', 'phone'] as const
type Step = typeof STEPS[number]

const SPACE_CHIPS = ['15평', '20평', '25평', '30평', '35평', '40평', '50평 이상']
const SPACE_CHIP_VALUES: Record<string, number> = {
  '15평': 15, '20평': 20, '25평': 25, '30평': 30,
  '35평': 35, '40평': 40, '50평 이상': 50,
}

interface ServiceItem {
  id: string
  name: string
  base_price: number
  unit: string
}

interface QuoteFormProps {
  businessId: string
  businessName: string
  services: ServiceItem[]
}

function BotBubble({ text, initial }: { text: string; initial: string }) {
  return (
    <div className="flex items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-8 h-8 rounded-full bg-[#FF7D00] flex items-center justify-center text-white text-xs font-bold shrink-0 mb-0.5">
        {initial}
      </div>
      <div className="max-w-[78%] bg-white rounded-3xl rounded-bl-lg px-4 py-3 shadow-sm">
        <p className="text-sm text-[#1A1A1A] font-medium leading-relaxed break-keep">{text}</p>
      </div>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="max-w-[70%] bg-[#FF7D00] rounded-3xl rounded-br-lg px-4 py-3 shadow-sm">
        <p className="text-sm text-white font-semibold break-keep">{text}</p>
      </div>
    </div>
  )
}

function TypingBubble({ initial }: { initial: string }) {
  return (
    <div className="flex items-end gap-2 animate-in fade-in duration-200">
      <div className="w-8 h-8 rounded-full bg-[#FF7D00] flex items-center justify-center text-white text-xs font-bold shrink-0 mb-0.5">
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

export function QuoteForm({ businessId, businessName, services }: QuoteFormProps) {
  const [currentStep, setCurrentStep] = useState<Step>('service')
  const [completedSteps, setCompletedSteps] = useState<Step[]>([])
  const [isTyping, setIsTyping] = useState(false)

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedServiceName, setSelectedServiceName] = useState('')
  const [spaceSize, setSpaceSize] = useState('')
  const [customSpace, setCustomSpace] = useState('')
  const [notes, setNotes] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 50)
  }, [currentStep, isTyping])

  const { execute, isPending } = useAction(calculateAndCreateQuoteAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      window.location.replace(`/q/${businessId}/quote/${data.quoteId}`)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '견적 계산에 실패했습니다'),
  })

  const initial = businessName.slice(0, 1)

  const getQuestion = (step: Step): string => {
    switch (step) {
      case 'service': return '안녕하세요! 어떤 청소 서비스가 필요하신가요?'
      case 'space':   return '공간이 몇 평인가요?'
      case 'notes':   return '특별히 신경 써드릴 부분이 있나요?'
      case 'name':    return '성함이 어떻게 되세요?'
      case 'phone':   return '카카오톡으로 견적서를 보내드릴게요 📱\n연락처를 알려주세요'
    }
  }

  const getAnswerDisplay = (step: Step): string => {
    switch (step) {
      case 'service': return selectedServiceName
      case 'space':   return `${spaceSize}평`
      case 'notes':   return notes.trim() || '특별 요청 없음'
      case 'name':    return customerName
      case 'phone':   return customerPhone
    }
  }

  const advance = (from: Step, to: Step) => {
    setCompletedSteps(prev => [...prev, from])
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setCurrentStep(to)
    }, 950)
  }

  const handleServiceSelect = (service: ServiceItem) => {
    setSelectedServiceId(service.id)
    setSelectedServiceName(service.name)
    setTimeout(() => advance('service', 'space'), 50)
  }

  const handleSpaceChip = (chip: string) => {
    setSpaceSize(String(SPACE_CHIP_VALUES[chip]))
    setTimeout(() => advance('space', 'notes'), 50)
  }

  const handleSpaceCustom = () => {
    const val = Number(customSpace)
    if (!val || val < 1) return
    setSpaceSize(customSpace)
    advance('space', 'notes')
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
    execute({
      business_id:    businessId,
      service_id:     selectedServiceId,
      space_size:     Number(spaceSize),
      extra_notes:    notes.trim() || undefined,
      customer_name:  customerName.trim(),
      customer_phone: clean,
    })
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] flex flex-col">

      {/* 상단 헤더 */}
      <header className="bg-white border-b border-[#F0EBE3] sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#FF7D00] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initial}
            </div>
            <div>
              <p className="font-bold text-sm text-[#1A1A1A] leading-tight">{businessName}</p>
              <p className="text-[11px] text-[#8D8D8D]">견적 문의</p>
            </div>
          </div>
          {/* 진행 단계 점 */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((s) => (
              <div
                key={s}
                className={[
                  'rounded-full transition-all duration-300',
                  completedSteps.includes(s)
                    ? 'w-2 h-2 bg-[#FF7D00]'
                    : s === currentStep
                      ? 'w-2.5 h-2.5 bg-[#FF7D00] opacity-70'
                      : 'w-2 h-2 bg-[#E0D9D0]',
                ].join(' ')}
              />
            ))}
          </div>
        </div>
      </header>

      {/* 채팅 스레드 */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto space-y-3">

          {/* 완료된 단계 대화 기록 */}
          {completedSteps.map((step) => (
            <div key={step} className="space-y-2">
              <BotBubble text={getQuestion(step)} initial={initial} />
              <UserBubble text={getAnswerDisplay(step)} />
            </div>
          ))}

          {/* 타이핑 중이면 점 세 개, 아니면 현재 질문 */}
          {isTyping
            ? <TypingBubble initial={initial} />
            : <BotBubble text={getQuestion(currentStep)} initial={initial} />
          }

          <div ref={chatEndRef} className="h-1" />
        </div>
      </div>

      {/* 입력 영역 (타이핑 중엔 숨김) */}
      <div className="bg-white border-t border-[#F0EBE3] px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto space-y-3">
          {isTyping && (
            <div className="h-12 flex items-center justify-center">
              <p className="text-xs text-[#B0B0B0]">답변을 입력하고 있어요...</p>
            </div>
          )}

          {/* 서비스 선택 */}
          {!isTyping && currentStep === 'service' && (
            services.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleServiceSelect(s)}
                    className="text-left px-4 py-3.5 rounded-2xl border-2 border-[#F0EBE3] bg-[#FAFAFA] font-semibold text-sm text-[#1A1A1A] active:bg-[#FFF3E8] active:border-[#FF7D00] transition-colors"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#8D8D8D] text-center py-4">등록된 서비스가 없습니다</p>
            )
          )}

          {/* 평수 선택 */}
          {!isTyping && currentStep === 'space' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {SPACE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSpaceChip(chip)}
                    className="px-4 py-2.5 rounded-full border-2 border-[#F0EBE3] bg-[#FAFAFA] text-sm font-semibold text-[#1A1A1A] active:bg-[#FFF3E8] active:border-[#FF7D00] transition-colors"
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
                  className="h-12 rounded-2xl border-[#F0EBE3] text-sm"
                />
                <button
                  type="button"
                  onClick={handleSpaceCustom}
                  disabled={!customSpace}
                  className="shrink-0 w-12 h-12 rounded-2xl bg-[#FF7D00] disabled:opacity-40 flex items-center justify-center transition-opacity"
                >
                  <ChevronRight className="h-5 w-5 text-white" />
                </button>
              </div>
            </div>
          )}

          {/* 요청사항 */}
          {!isTyping && currentStep === 'notes' && (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="예) 에어컨 포함, 주방 기름때 심함, 반려동물 있음"
                rows={3}
                autoFocus
                className="w-full rounded-2xl border border-[#F0EBE3] bg-[#FAFAFA] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#FF7D00] focus:ring-opacity-30"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleNotes(true)}
                  className="flex-1 h-12 rounded-2xl border-2 border-[#F0EBE3] text-sm font-semibold text-[#8D8D8D] active:bg-[#F5F0EB] transition-colors"
                >
                  없어요, 건너뛸게요
                </button>
                <button
                  type="button"
                  onClick={() => handleNotes(false)}
                  disabled={!notes.trim()}
                  className="flex-1 h-12 rounded-2xl bg-[#FF7D00] disabled:opacity-40 text-white font-bold text-sm transition-opacity"
                >
                  다음으로 →
                </button>
              </div>
            </div>
          )}

          {/* 이름 */}
          {!isTyping && currentStep === 'name' && (
            <div className="flex gap-2">
              <Input
                placeholder="홍길동"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleName()}
                autoFocus
                className="h-12 rounded-2xl border-[#F0EBE3] text-sm"
              />
              <button
                type="button"
                onClick={handleName}
                disabled={customerName.trim().length < 2}
                className="shrink-0 w-12 h-12 rounded-2xl bg-[#FF7D00] disabled:opacity-40 flex items-center justify-center transition-opacity"
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
            </div>
          )}

          {/* 연락처 + 최종 제출 */}
          {!isTyping && currentStep === 'phone' && (
            <div className="space-y-2">
              <Input
                placeholder="01012345678"
                inputMode="numeric"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoFocus
                className="h-12 rounded-2xl border-[#F0EBE3] text-sm"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || customerPhone.length < 10}
                className="w-full h-14 rounded-2xl bg-[#FF7D00] text-white font-extrabold text-base disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {isPending ? '맞춤 견적을 계산하고 있어요...' : '무료 견적 받기 →'}
              </button>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
