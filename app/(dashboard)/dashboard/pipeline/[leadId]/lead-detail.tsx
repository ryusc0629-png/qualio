'use client'

import { useState, useTransition } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
import { createLeadActivityAction, updateLeadStatusAction } from '@/lib/actions/crm'
import { STAGE_CONFIG } from '../pipeline-list'
import { B2bQuoteForm } from './b2b-quote-form'
import { Phone, MapPin, Calendar, ArrowLeft, Plus, PhoneCall, MapPin as VisitIcon, FileText, StickyNote } from 'lucide-react'
import Link from 'next/link'

// ── 타입 ──────────────────────────────────────────────────

type Lead = {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  address: string | null
  status: string
  customer_type: string
  monthly_budget: number | null
  next_follow_up_date: string | null
  notes: string | null
  created_at: string
}

interface QuoteItem {
  name: string
  unit: string
  qty: number
  unit_price: number
}

type ExistingQuote = {
  id: string
  quote_number: string | null
  valid_until: string | null
  items: QuoteItem[]
  total_amount: number
  tax_included: boolean
  conditions: string | null
  site_name: string | null
  site_address: string | null
  site_area: string | null
  frequency: string | null
  worker_count: number | null
  spec_content: string | null
}

type Activity = {
  id: string
  type: string
  content: string | null
  activity_at: string
  created_at: string
}

const ACTIVITY_CONFIG: Record<string, { text: string; icon: typeof PhoneCall; color: string }> = {
  call:  { text: '전화',    icon: PhoneCall, color: 'bg-blue-100 text-blue-700' },
  visit: { text: '방문',    icon: VisitIcon, color: 'bg-indigo-100 text-indigo-700' },
  quote: { text: '견적 발송', icon: FileText, color: 'bg-amber-100 text-amber-700' },
  note:  { text: '메모',    icon: StickyNote, color: 'bg-gray-100 text-gray-700' },
}

const STAGE_ORDER = ['new', 'contacted', 'follow_up', 'quoted', 'negotiating', 'contracted', 'rejected']

// ── 메인 컴포넌트 ──────────────────────────────────────────

export function LeadDetail({ lead, activities, existingQuote }: { lead: Lead; activities: Activity[]; existingQuote: ExistingQuote | null }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [showAddForm, setShowAddForm] = useState(false)
  const [activityType, setActivityType] = useState('note')
  const [activityContent, setActivityContent] = useState('')
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10))

  const { execute: executeStatus } = useAction(updateLeadStatusAction, {
    onSuccess: () => startTransition(() => router.refresh()),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeActivity, isPending: addingActivity } = useAction(createLeadActivityAction, {
    onSuccess: () => {
      toast.success('기록했어요!')
      setShowAddForm(false)
      setActivityContent('')
      setActivityType('note')
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const stage = STAGE_CONFIG[lead.status] ?? { text: lead.status, color: 'bg-gray-100 text-gray-700' }
  const isCompany = lead.customer_type === 'company'

  const handleAddActivity = () => {
    executeActivity({
      leadId:      lead.id,
      type:        activityType,
      content:     activityContent,
      activity_at: new Date(activityDate).toISOString(),
    })
  }

  return (
    <div className="space-y-5">
      {/* 뒤로가기 */}
      <Link
        href="/dashboard/pipeline"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        거래처 목록
      </Link>

      {/* 거래처 정보 카드 */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isCompany ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                {isCompany ? '거래처' : '일반'}
              </span>
              <h1 className="text-lg font-bold">{lead.company_name}</h1>
              {lead.contact_name && (
                <span className="text-sm text-muted-foreground">담당 {lead.contact_name}</span>
              )}
            </div>

            <div className="mt-2 space-y-1">
              {lead.phone && (
                <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {lead.phone}
                </p>
              )}
              {lead.address && (
                <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {lead.address}
                </p>
              )}
              {lead.monthly_budget && (
                <p className="text-sm text-muted-foreground">
                  예상 월 <span className="font-semibold text-foreground">{lead.monthly_budget.toLocaleString()}원</span>
                </p>
              )}
              {lead.next_follow_up_date && (
                <p className="text-sm flex items-center gap-1.5 text-amber-600">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  다음 연락: {new Date(lead.next_follow_up_date).toLocaleDateString('ko-KR')}
                </p>
              )}
            </div>
          </div>

          {/* 단계 변경 + 견적서 버튼 */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Select value={lead.status} onValueChange={(v) => executeStatus({ leadId: lead.id, status: v })}>
              <SelectTrigger className={`h-8 text-xs px-2.5 border-0 font-medium w-auto ${stage.color}`}>
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
            {isCompany && (
              <B2bQuoteForm
                leadId={lead.id}
                leadName={lead.company_name}
                existingQuote={existingQuote}
              />
            )}
          </div>
        </div>

        {/* 단계 진행 바 */}
        <div className="flex gap-1">
          {['new', 'contacted', 'follow_up', 'quoted', 'negotiating', 'contracted'].map((s, i) => {
            const currentIdx = STAGE_ORDER.indexOf(lead.status)
            const isRejected = lead.status === 'rejected'
            const stepIdx = STAGE_ORDER.indexOf(s)
            const isPast = !isRejected && currentIdx >= stepIdx
            return (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  isRejected ? 'bg-red-200' : isPast ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )
          })}
        </div>

        {/* 메모 */}
        {lead.notes && (
          <div className="bg-muted/40 rounded-lg px-3 py-2.5">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
          </div>
        )}
      </div>

      {/* 상담 기록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">상담 기록</h2>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            기록 추가
          </Button>
        </div>

        {/* 기록 추가 폼 */}
        {showAddForm && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
              {Object.entries(ACTIVITY_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivityType(key)}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    activityType === key
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {cfg.text}
                </button>
              ))}
            </div>

            <div>
              <Label className="text-xs">날짜</Label>
              <Input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="mt-1 h-9"
              />
            </div>

            <div>
              <Label className="text-xs">내용 (필수)</Label>
              <Textarea
                value={activityContent}
                onChange={(e) => setActivityContent(e.target.value)}
                placeholder="통화 내용, 방문 결과, 요구사항 등을 기록하세요"
                rows={3}
                className="mt-1 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddForm(false)}>
                취소
              </Button>
              <Button
                size="sm"
                className="flex-1 h-10"
                disabled={addingActivity || !activityContent.trim()}
                onClick={handleAddActivity}
              >
                {addingActivity ? '저장 중...' : '저장하기'}
              </Button>
            </div>
          </div>
        )}

        {/* 기록 타임라인 */}
        {activities.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">아직 상담 기록이 없어요</p>
            <p className="text-xs text-muted-foreground mt-1">전화, 방문, 견적 발송 등을 기록해두세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => {
              const cfg = ACTIVITY_CONFIG[activity.type] ?? ACTIVITY_CONFIG.note
              const Icon = cfg.icon
              return (
                <div key={activity.id} className="bg-white rounded-xl border p-4 flex gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{cfg.text}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(activity.activity_at).toLocaleDateString('ko-KR', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">
                      {activity.content}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
