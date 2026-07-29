'use client'

import { useState, useTransition, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  createLeadAction,
  updateLeadAction,
  updateLeadStatusAction,
  deleteLeadAction,
} from '@/lib/actions/crm'
import { Phone, MapPin, Calendar, Pencil, Trash2, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { ConvertToCustomerButton } from './[leadId]/convert-to-customer-button'
import type { LiveStatus } from '@/lib/utils/lead-live-status'
import { LeadForm, emptyLeadForm, leadToFormValues, leadFormToInput, type LeadFormValues } from '@/components/dashboard/lead-form'

// ── 상수 ──────────────────────────────────────────────────

export const STAGE_CONFIG: Record<string, { text: string; color: string }> = {
  new:         { text: '새 문의',   color: 'bg-gray-100 text-gray-700' },
  contacted:   { text: '연락함',    color: 'bg-blue-100 text-blue-700' },
  follow_up:   { text: '현장 방문', color: 'bg-indigo-100 text-indigo-700' },
  quoted:      { text: '견적 보냄', color: 'bg-amber-100 text-amber-700' },
  negotiating: { text: '금액 협의', color: 'bg-orange-100 text-orange-700' },
  contracted:  { text: '계약 완료', color: 'bg-green-100 text-green-700' },
  rejected:    { text: '포기',      color: 'bg-red-100 text-red-600' },
  archived:    { text: '보관됨',    color: 'bg-gray-100 text-gray-400' },
}

const STAGE_ORDER = ['new', 'contacted', 'follow_up', 'quoted', 'negotiating', 'contracted', 'rejected']

const FILTER_TABS = [
  { key: '',            label: '전체' },
  { key: 'active',      label: '진행 중' },
  { key: 'contracted',  label: '계약 완료' },
  { key: 'rejected',    label: '포기' },
]

// 유형(거래처/개인) 필터 — 진행 단계 필터와 별개 축
const TYPE_FILTER_TABS = [
  { key: '',           label: '전체' },
  { key: 'company',    label: '거래처' },
  { key: 'individual', label: '개인' },
]

// ── 타입 ──────────────────────────────────────────────────

type Lead = {
  id: string
  company_name: string
  contact_name: string | null
  contact_title: string | null
  email: string | null
  phone: string | null
  address: string | null
  status: string
  customer_type: string
  monthly_budget: number | null
  next_follow_up_date: string | null
  notes: string | null
  created_at: string
}

type QuoteSummary = { total_amount: number; frequency: string | null; serviceName: string | null }

interface Props {
  leads: Lead[]
  businessId: string
  filterStatus?: string
  quoteByLead?: Record<string, QuoteSummary>
  convertedLeadIds?: string[]
  liveStatusByLeadId?: Record<string, LiveStatus>
  monthlyRecurring?: number // 활성 정기계약 월 매출 합계 (고객관리 '월 정기 매출'과 동일 출처)
}

// 예약 일시 → 짧은 한글 날짜
function formatLiveDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export function PipelineList({ leads, filterStatus, quoteByLead = {}, convertedLeadIds = [], liveStatusByLeadId = {}, monthlyRecurring = 0 }: Props) {
  const router = useRouter()
  const convertedSet = new Set(convertedLeadIds)
  const [activeFilter, setActiveFilter] = useState(filterStatus ?? '')
  const [typeFilter, setTypeFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<LeadFormValues>(emptyLeadForm)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [quickFollowUp, setQuickFollowUp] = useState<{ leadId: string; date: string } | null>(null)
  const [, startTransition] = useTransition()

  const { execute: executeCreate, isPending: creating } = useAction(createLeadAction, {
    onSuccess: () => {
      toast.success('고객을 추가했어요!')
      setAddOpen(false)
      setForm(emptyLeadForm)
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeUpdate, isPending: updating } = useAction(updateLeadAction, {
    onSuccess: () => {
      toast.success('수정했어요!')
      setEditLead(null)
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeFollowUp, isPending: savingFollowUp } = useAction(updateLeadAction, {
    onSuccess: () => {
      toast.success('연락일을 저장했어요!')
      setQuickFollowUp(null)
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 상태 변경을 누르는 즉시 화면에 반영(낙관적 업데이트) — 저장은 백그라운드.
  // leadId별로 임시 상태를 덮어써서 서버 응답을 기다리는 딜레이 착각을 없앤다.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({})

  // 서버 데이터(props)가 임시값과 같아진 항목만 정리한다.
  // onSuccess에서 곧바로 전부 비우면 router.refresh 완료 전까지 예전 상태로 깜빡여
  // "안 눌렸나?" 하는 착각을 준다 → props와 일치하는 것만 제거해 깜빡임 없이 동기화.
  useEffect(() => {
    setStatusOverrides((prev) => {
      const keys = Object.keys(prev)
      if (keys.length === 0) return prev
      const next: Record<string, string> = {}
      for (const [id, status] of Object.entries(prev)) {
        const lead = leads.find((l) => l.id === id)
        if (lead && lead.status !== status) next[id] = status // 아직 서버 미반영 → 유지
      }
      return Object.keys(next).length === keys.length ? prev : next
    })
  }, [leads])

  const { execute: executeStatus } = useAction(updateLeadStatusAction, {
    onSuccess: () => startTransition(() => router.refresh()), // 임시값은 위 useEffect가 동기화 후 정리
    onError: ({ error }) => {
      setStatusOverrides({}) // 실패 시 서버 상태(원래대로)로 되돌림
      toast.error(error.serverError ?? '다시 시도해주세요')
    },
  })

  const handleStatusChange = (leadId: string, status: string) => {
    setStatusOverrides((prev) => ({ ...prev, [leadId]: status })) // 즉시 반영
    executeStatus({ leadId, status })
  }

  const { execute: executeDelete, isPending: deleting } = useAction(deleteLeadAction, {
    onSuccess: () => {
      toast.success('삭제했어요')
      setDeletingId(null)
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 필터 적용 (보관된 고객은 항상 제외) — 진행 단계 + 유형(거래처/개인) 두 축 함께 적용
  const filtered = leads.filter((lead) => {
    if (lead.status === 'archived') return false
    if (typeFilter && lead.customer_type !== typeFilter) return false
    if (activeFilter === 'contracted') return lead.status === 'contracted'
    if (activeFilter === 'rejected') return lead.status === 'rejected'
    if (activeFilter === 'active') return lead.status !== 'contracted' && lead.status !== 'rejected'
    return true
  })

  const handleFormChange = (key: keyof LeadFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleAdd = () => {
    executeCreate(leadFormToInput(form))
  }

  const openEdit = (lead: Lead) => {
    setForm(leadToFormValues(lead))
    setEditLead(lead)
  }

  const handleUpdate = () => {
    if (!editLead) return
    executeUpdate({ leadId: editLead.id, ...leadFormToInput(form) })
  }

  return (
    <div className="space-y-4">

      {/* 필터 탭 + 추가 버튼 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setForm(emptyLeadForm) }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9 shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              고객 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>고객 추가</DialogTitle>
            </DialogHeader>
            <LeadForm form={form} onChange={handleFormChange} />
            <Button onClick={handleAdd} disabled={creating || !form.company_name} className="w-full h-12">
              {creating ? '추가 중...' : '추가하기'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* 유형 필터 (거래처/개인) — 진행 단계와 별개로 골라보기 */}
      <div className="flex gap-1">
        {TYPE_FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              typeFilter === tab.key
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '진행 중', value: leads.filter(l => l.status !== 'contracted' && l.status !== 'rejected').length, color: 'text-blue-600' },
          { label: '계약 완료', value: leads.filter(l => l.status === 'contracted').length, color: 'text-green-600' },
          { label: '예상 월 매출', value: `${(monthlyRecurring / 10000).toFixed(0)}만원`, color: 'text-primary' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border p-3 text-center">
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 빈 상태 */}
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed p-12 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {activeFilter === '' && typeFilter === '' ? '아직 등록된 고객이 없어요' : '조건에 맞는 고객이 없어요'}
          </p>
          {activeFilter === '' && typeFilter === '' && (
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              첫 고객 추가하기
            </Button>
          )}
        </div>
      )}

      {/* 거래처 목록 */}
      <div className="space-y-2">
        {filtered.map((lead) => {
          const effectiveStatus = statusOverrides[lead.id] ?? lead.status
          const stage = STAGE_CONFIG[effectiveStatus] ?? { text: effectiveStatus, color: 'bg-gray-100 text-gray-600' }
          const isCompany = lead.customer_type === 'company'
          const isContracted = lead.status === 'contracted'
          const isConverted = convertedSet.has(lead.id)
          const quote = quoteByLead[lead.id] ?? null
          const live = liveStatusByLeadId[lead.id] ?? null

          return (
            <div key={lead.id} className="bg-white rounded-xl border border-border hover:border-primary/30 transition-colors p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">

                  {/* 이름 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isCompany ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                      {isCompany ? '거래처' : '일반'}
                    </span>
                    <p className="font-semibold">{lead.company_name}</p>
                    {lead.contact_name && (
                      <span className="text-xs text-muted-foreground">담당 {lead.contact_name}</span>
                    )}
                  </div>

                  {/* 연락처 + 주소 */}
                  <div className="mt-1.5 space-y-0.5">
                    {lead.phone && (
                      <p className="text-sm flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        {lead.phone}
                      </p>
                    )}
                    {lead.address && (
                      <p className="text-sm flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {lead.address}
                      </p>
                    )}
                    {lead.next_follow_up_date && (
                      <p className="text-xs flex items-center gap-1 text-amber-600">
                        <Calendar className="h-3 w-3 shrink-0" />
                        다음 연락: {new Date(lead.next_follow_up_date).toLocaleDateString('ko-KR')}
                      </p>
                    )}
                    {lead.monthly_budget && (
                      <p className="text-xs text-muted-foreground">
                        예상 월 {lead.monthly_budget.toLocaleString()}원
                      </p>
                    )}
                  </div>
                </div>

                {/* 우측: 단계 + 버튼 */}
                <div className="shrink-0 flex flex-col items-end gap-2">
                  {isCompany ? (
                    // 거래처: 수동 단계 선택
                    <Select value={effectiveStatus} onValueChange={(v) => handleStatusChange(lead.id, v)}>
                      <SelectTrigger className={`h-7 text-xs px-2 border-0 font-medium w-auto ${stage.color}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_ORDER.map((s) => (
                          <SelectItem key={s} value={s} className="text-sm">
                            {STAGE_CONFIG[s]?.text ?? s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : live ? (
                    // 일반 고객: 자동 계산 상태 + 상태별 빠른 액션
                    <div className="text-right space-y-1">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${live.className}`}>
                        {live.label}
                      </span>
                      {live.date && (
                        <p className="text-[11px] text-muted-foreground">
                          {formatLiveDate(live.date)} 예정
                        </p>
                      )}
                      {live.key === 'quote' && (
                        <button
                          onClick={() => setQuickFollowUp({
                            leadId: lead.id,
                            date: lead.next_follow_up_date ?? new Date().toISOString().slice(0, 10),
                          })}
                          className="text-[11px] text-primary underline block"
                        >
                          연락일 설정
                        </button>
                      )}
                      {(live.key === 'confirmed' || live.key === 'in_progress') && (
                        <Link href="/dashboard/work" className="text-[11px] text-primary underline block">
                          예약 보기 →
                        </Link>
                      )}
                    </div>
                  ) : (
                    // 일반 고객: 견적·예약 없음 → 예약 만들기 유도
                    <Link
                      href="/dashboard/work"
                      className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-md whitespace-nowrap"
                    >
                      예약 만들기
                    </Link>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(lead)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingId(lead.id)}
                      className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <Link
                      href={`/dashboard/pipeline/${lead.id}`}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* 일반 고객 빠른 연락일 설정 */}
              {quickFollowUp?.leadId === lead.id && (
                <div className="mt-3 pt-3 border-t flex items-center gap-2">
                  <input
                    type="date"
                    value={quickFollowUp.date}
                    onChange={(e) => setQuickFollowUp((prev) => prev ? { ...prev, date: e.target.value } : null)}
                    className="flex-1 h-9 text-sm border border-input rounded-md px-2 bg-background"
                  />
                  <Button
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={savingFollowUp}
                    onClick={() => executeFollowUp({
                      leadId: lead.id,
                      company_name: lead.company_name,
                      customer_type: lead.customer_type,
                      contact_name: lead.contact_name ?? undefined,
                      contact_title: lead.contact_title ?? undefined,
                      email: lead.email ?? undefined,
                      phone: lead.phone ?? undefined,
                      address: lead.address ?? undefined,
                      monthly_budget: lead.monthly_budget ?? undefined,
                      next_follow_up_date: quickFollowUp.date || undefined,
                      notes: lead.notes ?? undefined,
                    })}
                  >
                    {savingFollowUp ? '저장 중...' : '연락일 저장'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2"
                    onClick={() => setQuickFollowUp(null)}
                  >
                    취소
                  </Button>
                </div>
              )}

              {/* 계약 완료 → 고객 전환 */}
              {isContracted && (
                <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {isConverted ? '계약 고객으로 등록됐어요' : '계약을 따냈어요! 고객으로 등록하세요'}
                  </p>
                  <ConvertToCustomerButton
                    lead={{
                      id: lead.id,
                      company_name: lead.company_name,
                      phone: lead.phone,
                      address: lead.address,
                    }}
                    quote={quote}
                    alreadyConverted={isConverted}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 수정 다이얼로그 */}
      <Dialog open={!!editLead} onOpenChange={(o) => { if (!o) setEditLead(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>고객 수정</DialogTitle>
          </DialogHeader>
          <LeadForm
            form={form}
            onChange={handleFormChange}
            liveStatus={editLead ? liveStatusByLeadId[editLead.id] : undefined}
          />
          <Button onClick={handleUpdate} disabled={updating || !form.company_name} className="w-full h-12">
            {updating ? '저장 중...' : '저장하기'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>이 고객을 삭제할까요?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">삭제하면 상담 기록도 함께 사라져요. 되돌릴 수 없어요.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeletingId(null)}>취소</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleting}
              onClick={() => deletingId && executeDelete({ leadId: deletingId })}
            >
              {deleting ? '삭제 중...' : '삭제하기'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
