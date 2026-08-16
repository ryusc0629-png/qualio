'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import { openAddressSearch } from '@/lib/address/postcode'

// 주소 한 줄 형식(기본 — 상세) 유틸은 서버에서도 써야 해 lib/address/format.ts에 있다.
// 기존 import 경로가 깨지지 않게 여기서 그대로 다시 내보낸다.
import { splitAddress, joinAddress } from '@/lib/address/format'
export { ADDRESS_SEPARATOR, splitAddress, joinAddress } from '@/lib/address/format'

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
