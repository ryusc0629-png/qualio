'use client'

import { useCallback } from 'react'
import { openAddressSearch } from '@/lib/address/postcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { LiveStatus } from '@/lib/utils/lead-live-status'

// 거래처(리드) 추가·수정에서 공용으로 쓰는 폼. 목록 페이지와 상세 페이지가 같은 폼을 공유한다.

// ── 폼 값 ──────────────────────────────────────────────────

export const emptyLeadForm = {
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

export type LeadFormValues = typeof emptyLeadForm

// 저장된 리드 → 폼 값 (수정 진입 시 프리필)
export function leadToFormValues(lead: {
  company_name: string
  customer_type: string
  contact_name: string | null
  contact_title: string | null
  email: string | null
  phone: string | null
  address: string | null
  monthly_budget: number | null
  next_follow_up_date: string | null
  notes: string | null
}): LeadFormValues {
  return {
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
  }
}

// 폼 값 → 액션 입력 (createLeadAction·updateLeadAction 공용, leadId는 호출부에서 붙임)
export function leadFormToInput(form: LeadFormValues) {
  return {
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
  }
}

// ── 폼 컴포넌트 ────────────────────────────────────────────

export function LeadForm({
  form,
  onChange,
  liveStatus,
}: {
  form: LeadFormValues
  onChange: (key: keyof LeadFormValues, value: string) => void
  liveStatus?: LiveStatus
}) {
  const handleAddressSearch = useCallback(() => {
    openAddressSearch((address) => onChange('address', address))
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
