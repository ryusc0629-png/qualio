'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Award, BadgeCheck, Plus, X } from 'lucide-react'

interface Props {
  experienceYears: string
  businessNumber: string
  certifications: string[]
  onChange: (next: {
    experienceYears?: string
    businessNumber?: string
    certifications?: string[]
  }) => void
}

// 사업자등록번호 하이픈 자동 포맷 (숫자 10자리 → XXX-XX-XXXXX)
function formatBusinessNumber(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 10)
  if (digits.length < 4) return digits
  if (digits.length < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

// 전문성·신뢰 섹션 — 숨고 '전문성 증명'/'사업자등록증' 벤치마킹.
// 경력 연차 + 사업자등록번호 + 자격증·보유장비. 홍보 페이지 상단 신뢰 앵커에 자동 반영.
export function CredentialsSection({
  experienceYears,
  businessNumber,
  certifications,
  onChange,
}: Props) {
  // 자격증 추가 입력칸 (엔터 또는 추가 버튼)
  const [certDraft, setCertDraft] = useState('')

  const addCert = () => {
    const value = certDraft.trim()
    if (!value) return
    if (certifications.includes(value)) {
      setCertDraft('')
      return
    }
    onChange({ certifications: [...certifications, value].slice(0, 8) })
    setCertDraft('')
  }

  const removeCert = (idx: number) => {
    onChange({ certifications: certifications.filter((_, i) => i !== idx) })
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            전문성·신뢰
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          경력·사업자 등록·자격증을 넣으면 홍보 페이지 위쪽에 <span className="font-medium text-foreground">‘믿을 수 있는 업체’</span>라는
          신뢰 도장이 찍혀요. 특히 제안서 QR로 들어온 고객이 바로 확인하는 부분이에요. (선택)
        </p>
      </div>

      {/* 경력 연차 */}
      <div className="space-y-1.5">
        <Label htmlFor="experience_years" className="text-xs">청소 경력 (연차)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="experience_years"
            value={experienceYears}
            onChange={(e) => onChange({ experienceYears: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
            inputMode="numeric"
            placeholder="예: 10"
            className="text-right max-w-[120px]"
          />
          <span className="text-sm text-muted-foreground shrink-0">년</span>
        </div>
        {experienceYears && Number(experienceYears) > 0 && (
          <p className="text-xs text-primary">→ 홍보 페이지에 표시: 청소 경력 {Number(experienceYears)}년</p>
        )}
      </div>

      {/* 사업자등록번호 */}
      <div className="space-y-1.5">
        <Label htmlFor="business_number" className="text-xs">사업자등록번호</Label>
        <Input
          id="business_number"
          value={businessNumber}
          onChange={(e) => onChange({ businessNumber: formatBusinessNumber(e.target.value) })}
          inputMode="numeric"
          placeholder="예: 665-15-01867"
          className="max-w-[220px]"
        />
        {businessNumber.replace(/[^0-9]/g, '').length === 10 && (
          <p className="flex items-center gap-1 text-xs text-primary">
            <BadgeCheck className="h-3.5 w-3.5" />
            → 홍보 페이지에 ‘사업자 등록 업체’ 배지가 붙어요
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          번호를 넣으면 고객이 정식 등록 업체임을 바로 확인할 수 있어 신뢰가 올라가요.
        </p>
      </div>

      {/* 자격증·보유장비 */}
      <div className="space-y-2">
        <Label className="text-xs">자격증·인증·보유장비 (선택)</Label>

        {certifications.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {certifications.map((cert, idx) => (
              <span
                key={`${cert}-${idx}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium"
              >
                {cert}
                <button
                  type="button"
                  onClick={() => removeCert(idx)}
                  className="hover:text-destructive transition-colors"
                  aria-label={`${cert} 삭제`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {certifications.length < 8 && (
          <div className="flex items-center gap-2">
            <Input
              value={certDraft}
              onChange={(e) => setCertDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCert()
                }
              }}
              placeholder="예: 방역소독업 등록, 화학물질 안전교육 이수, 배낭형 흡진기"
              maxLength={30}
              className="flex-1"
            />
            <button
              type="button"
              onClick={addCert}
              className="flex items-center gap-1 h-10 px-3 rounded-lg border text-sm text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
              추가
            </button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          하나씩 입력하고 추가를 누르면 칩으로 쌓여요. 자격증이 없으면 보유 장비나 이수한 교육을 적어도 좋아요.
        </p>
      </div>
    </div>
  )
}
