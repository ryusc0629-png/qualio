'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import { openAddressSearch } from '@/lib/address/postcode'

// 기본 주소(도로명/지번)와 상세 주소(동·호수·층)를 하나의 문자열로 합쳐 저장한다.
// 저장 형식: "울산 남구 삼산로 123 — 101동 1234호"
export const ADDRESS_SEPARATOR = ' — '

/** 저장된 주소 한 줄을 기본 주소 / 상세 주소로 나눈다. */
export function splitAddress(full?: string | null): { base: string; detail: string } {
  const v = full ?? ''
  const i = v.indexOf(ADDRESS_SEPARATOR)
  if (i === -1) return { base: v, detail: '' }
  return { base: v.slice(0, i), detail: v.slice(i + ADDRESS_SEPARATOR.length) }
}

/** 기본 주소와 상세 주소를 한 줄로 합친다. 상세가 비면 기본 주소만 남긴다. */
export function joinAddress(base: string, detail: string): string {
  return detail.trim() ? `${base}${ADDRESS_SEPARATOR}${detail}` : base
}

interface AddressFieldProps {
  /** 기본+상세가 합쳐진 주소 한 줄 */
  value: string
  onChange: (next: string) => void
  id?: string
  label?: string
  /** 라벨 옆에 붙일 문구 (예: '(필수)') */
  labelSuffix?: string
  className?: string
  /** 라벨 없이 입력란만 렌더 (이미 상위에서 라벨을 그리는 경우) */
  hideLabel?: boolean
  inputClassName?: string
}

/**
 * 주소 입력 공용 컴포넌트 — 주소 검색 + 상세 주소(동·호수) 입력을 한 세트로 제공한다.
 * 상세 주소 칸은 기본 주소가 채워진 뒤에만 보여, 상세만 남는 잘못된 값이 생기지 않는다.
 */
export function AddressField({
  value,
  onChange,
  id,
  label = '주소',
  labelSuffix,
  className,
  hideLabel = false,
  inputClassName,
}: AddressFieldProps) {
  const { base, detail } = splitAddress(value)

  // 기본 주소를 지우면 상세 주소도 함께 비운다 (상세만 남은 주소는 의미가 없음)
  const handleBaseChange = (nextBase: string) => {
    onChange(nextBase ? joinAddress(nextBase, detail) : '')
  }

  return (
    <div className={className ?? 'space-y-1'}>
      {!hideLabel && (
        <Label htmlFor={id}>
          {label}
          {labelSuffix && <span className="text-xs font-normal text-muted-foreground ml-1">{labelSuffix}</span>}
        </Label>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={base}
          onChange={(e) => handleBaseChange(e.target.value)}
          placeholder="주소 검색을 눌러주세요"
          autoComplete="off"
          className={inputClassName ?? 'flex-1'}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 px-3"
          onClick={() => openAddressSearch((addr) => onChange(joinAddress(addr, detail)))}
        >
          <Search className="h-4 w-4 mr-1" />
          검색
        </Button>
      </div>
      {base && (
        <Input
          value={detail}
          onChange={(e) => onChange(joinAddress(base, e.target.value))}
          placeholder="상세 주소 (예: 101동 1234호, 3층)"
          autoComplete="off"
          className={inputClassName}
        />
      )}
    </div>
  )
}
