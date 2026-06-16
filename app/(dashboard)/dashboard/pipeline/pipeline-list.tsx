'use client'

import { useState, useTransition, useCallback } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

// ── 타입 ──────────────────────────────────────────────────

// 카카오 우편번호 서비스 타입
interface DaumPostcodeResult {
  roadAddress: string
  jibunAddress: string
}
interface DaumPostcodeInstance {
  open(): void
}
interface DaumPostcodeWindow {
  daum?: {
    Postcode: new (config: { oncomplete: (data: DaumPostcodeResult) => void }) => DaumPostcodeInstance
  }
}

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
}

// 예약 일시 → 짧은 한글 날짜
function formatLiveDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

// ── 폼 초기값 ──────────────────────────────────────────────

const emptyForm = {
  company_name: '',
  customer_type: 'company',
  contact_name: '',
  contact_title: '',
  email: '',
  phone: '',
  address: '',
  monthly_budget: '',
  next_follow_up_date: '',
  notes: '',
}

// ── 메인 컴포넌트 ──────────────────────────────────────────

export function PipelineList({ leads, filterStatus, quoteByLead = {}, convertedLeadIds = [], liveStatusByLeadId = {} }: Props) {
  const router = useRouter()
  const convertedSet = new Set(convertedLeadIds)
  const [activeFilter, setActiveFilter] = useState(filterStatus ?? '')
  const [addOpen, setAddOpen] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [quickFollowUp, setQuickFollowUp] = useState<{ leadId: string; date: string } | null>(null)
  const [, startTransition] = useTransition()

  const { execute: executeCreate, isPending: creating } = useAction(createLeadAction, {
    onSuccess: () => {
      toast.success('거래처를 추가했어요!')
      setAddOpen(false)
      setForm(emptyForm)
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

  const { execute: executeStatus } = useAction(updateLeadStatusAction, {
    onSuccess: () => startTransition(() => router.refresh()),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeDelete, isPending: deleting } = useAction(deleteLeadAction, {
    onSuccess: () => {
      toast.success('삭제했어요')
      setDeletingId(null)
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 필터 적용 (보관된 거래처는 항상 제외)
  const filtered = leads.filter((lead) => {
    if (lead.status === 'archived') return false
    if (activeFilter === '') return true
    if (activeFilter === 'contracted') return lead.status === 'contracted'
    if (activeFilter === 'rejected') return lead.status === 'rejected'
    if (activeFilter === 'active') return lead.status !== 'contracted' && lead.status !== 'rejected'
    return true
  })

  const handleFormChange = (key: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleAdd = () => {
    executeCreate({
      company_name:        form.company_name,
      customer_type:       form.customer_type,
      contact_name:        form.contact_name || undefined,
      contact_title:       form.contact_title || undefined,
      email:               form.email || undefined,
      phone:               form.phone || undefined,
      address:             form.address || undefined,
      monthly_budget:      form.monthly_budget ? Number(form.monthly_budget) : undefined,
      next_follow_up_date: form.next_follow_up_date || undefined,
      notes:               form.notes || undefined,
    })
  }

  const openEdit = (lead: Lead) => {
    setForm({
      company_name:        lead.company_name,
      customer_type:       lead.customer_type,
      contact_name:        lead.contact_name ?? '',
      contact_title:       lead.contact_title ?? '',
      email:               lead.email ?? '',
      phone:               lead.phone ?? '',
      address:             lead.address ?? '',
      monthly_budget:      lead.monthly_budget?.toString() ?? '',
      next_follow_up_date: lead.next_follow_up_date ?? '',
      notes:               lead.notes ?? '',
    })
    setEditLead(lead)
  }

  const handleUpdate = () => {
    if (!editLead) return
    executeUpdate({
      leadId:              editLead.id,
      company_name:        form.company_name,
      customer_type:       form.customer_type,
      contact_name:        form.contact_name || undefined,
      contact_title:       form.contact_title || undefined,
      email:               form.email || undefined,
      phone:               form.phone || undefined,
      address:             form.address || undefined,
      monthly_budget:      form.monthly_budget ? Number(form.monthly_budget) : undefined,
      next_follow_up_date: form.next_follow_up_date || undefined,
      notes:               form.notes || undefined,
    })
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

        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setForm(emptyForm) }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9 shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              거래처 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>거래처 추가</DialogTitle>
            </DialogHeader>
            <LeadForm form={form} onChange={handleFormChange} />
            <Button onClick={handleAdd} disabled={creating || !form.company_name} className="w-full h-12">
              {creating ? '추가 중...' : '추가하기'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '진행 중', value: leads.filter(l => l.status !== 'contracted' && l.status !== 'rejected').length, color: 'text-blue-600' },
          { label: '계약 완료', value: leads.filter(l => l.status === 'contracted').length, color: 'text-green-600' },
          { label: '예상 월 매출', value: `${(leads.filter(l => l.status === 'contracted' && l.monthly_budget).reduce((s, l) => s + (l.monthly_budget ?? 0), 0) / 10000).toFixed(0)}만원`, color: 'text-primary' },
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
            {activeFilter === '' ? '아직 등록된 거래처가 없어요' : '해당 단계의 거래처가 없어요'}
          </p>
          {activeFilter === '' && (
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              첫 번째 거래처 추가하기
            </Button>
          )}
        </div>
      )}

      {/* 거래처 목록 */}
      <div className="space-y-2">
        {filtered.map((lead) => {
          const stage = STAGE_CONFIG[lead.status] ?? { text: lead.status, color: 'bg-gray-100 text-gray-600' }
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
                    <Select value={lead.status} onValueChange={(v) => executeStatus({ leadId: lead.id, status: v })}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>거래처 수정</DialogTitle>
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
            <DialogTitle>거래처를 삭제할까요?</DialogTitle>
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

// ── 공통 폼 컴포넌트 ──────────────────────────────────────

function LeadForm({
  form,
  onChange,
  liveStatus,
}: {
  form: typeof emptyForm
  onChange: (key: keyof typeof emptyForm, value: string) => void
  liveStatus?: LiveStatus
}) {
  const handleAddressSearch = useCallback(() => {
    const run = () => {
      new (window as unknown as DaumPostcodeWindow).daum!.Postcode({
        oncomplete: (data) => {
          onChange('address', data.roadAddress || data.jibunAddress)
        },
      }).open()
    }

    if ((window as unknown as DaumPostcodeWindow).daum?.Postcode) {
      run()
    } else {
      const script = document.createElement('script')
      script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
      script.onload = run
      document.body.appendChild(script)
    }
  }, [onChange])

  const displayBudget = form.monthly_budget
    ? Number(form.monthly_budget).toLocaleString('ko-KR')
    : ''

  const TYPE_OPTIONS = [
    { value: 'company', title: '거래처', desc: '회사·정기계약' },
    { value: 'individual', title: '일반', desc: '개인·일회성' },
  ]

  const isCompany = (form.customer_type || 'company') === 'company'

  return (
    <div className="space-y-3">
      {/* 견적·예약에서 자동 계산된 현재 상태 (읽기 전용) */}
      {liveStatus && (
        <div className="rounded-lg bg-muted/40 border p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">현재 상태</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${liveStatus.className}`}>
              {liveStatus.label}
            </span>
            {liveStatus.date && (
              <span className="text-xs text-muted-foreground">
                {new Date(liveStatus.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 예정
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">온라인 견적·예약에서 자동으로 표시돼요</p>
        </div>
      )}

      {/* 거래처 / 일반 구분 */}
      <div>
        <Label>구분</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {TYPE_OPTIONS.map((opt) => {
            const selected = (form.customer_type || 'company') === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange('customer_type', opt.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <p className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
                  {opt.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <Label>{isCompany ? '업체명 (필수)' : '고객명 (필수)'}</Label>
        <Input
          value={form.company_name}
          onChange={(e) => onChange('company_name', e.target.value)}
          placeholder={isCompany ? '예: (주)클린빌딩' : '예: 김영희'}
          className="mt-1"
        />
      </div>

      {/* 거래처(회사)일 때만: 담당자·직함·이메일 */}
      {isCompany && (
        <>
          <div>
            <Label>담당자 이름 (선택)</Label>
            <Input
              value={form.contact_name}
              onChange={(e) => onChange('contact_name', e.target.value)}
              placeholder="예: 김민수"
              className="mt-1"
            />
          </div>

          <div>
            <Label>직함 또는 직급 (선택)</Label>
            <Input
              value={form.contact_title}
              onChange={(e) => onChange('contact_title', e.target.value)}
              placeholder="예: 총무팀장, 대표이사, 시설관리팀장"
              className="mt-1"
            />
          </div>
        </>
      )}

      <div>
        <Label>전화번호</Label>
        <Input
          value={form.phone}
          onChange={(e) => onChange('phone', e.target.value.replace(/[^0-9-]/g, ''))}
          placeholder="예: 010-1234-5678"
          inputMode="tel"
          className="mt-1"
        />
      </div>

      {isCompany && (
        <div>
          <Label>이메일 (선택)</Label>
          <Input
            value={form.email}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="예: manager@company.co.kr"
            inputMode="email"
            type="email"
            className="mt-1"
          />
        </div>
      )}

      <div>
        <Label>주소</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={form.address}
            onChange={(e) => onChange('address', e.target.value)}
            placeholder="주소 찾기 버튼을 눌러주세요"
            readOnly
            className="flex-1 bg-muted/40 cursor-pointer"
            onClick={handleAddressSearch}
          />
          <Button type="button" variant="outline" size="sm" className="shrink-0 h-10" onClick={handleAddressSearch}>
            주소 찾기
          </Button>
        </div>
      </div>

      <div>
        <Label>예상 월 금액 (원)</Label>
        <Input
          value={displayBudget}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '')
            onChange('monthly_budget', raw)
          }}
          placeholder="예: 700,000"
          inputMode="numeric"
          className="mt-1"
        />
      </div>

      {/* 거래처만: 다음 연락 예정일 (일반 고객은 카드에서 빠른 설정 가능) */}
      {isCompany && (
        <div>
          <Label>다음 연락 예정일</Label>
          <Input
            type="date"
            value={form.next_follow_up_date}
            onChange={(e) => onChange('next_follow_up_date', e.target.value)}
            className="mt-1"
          />
        </div>
      )}

      <div>
        <Label>메모</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          placeholder="요구사항, 특이사항 등을 적어두세요"
          rows={3}
          className="mt-1 resize-none"
        />
      </div>
    </div>
  )
}
