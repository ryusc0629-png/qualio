'use client'

import { useState, useCallback } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FrequencyPicker } from '@/components/dashboard/frequency-picker'
import { createCustomerWithContractAction } from '@/lib/actions/customers'
import { UserCheck, CheckCircle2 } from 'lucide-react'

// 카카오(다음) 우편번호 서비스 타입
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

interface Props {
  lead: {
    id: string
    company_name: string
    phone: string | null
    address: string | null
  }
  // 견적서에서 자동으로 가져올 정보
  quote: {
    total_amount: number
    frequency: string | null
    serviceName: string | null
  } | null
  alreadyConverted: boolean
}

export function ConvertToCustomerButton({ lead, quote, alreadyConverted }: Props) {
  const [open, setOpen] = useState(false)

  // 견적서 기반 초기값 (없으면 빈 값)
  const [name, setName] = useState(lead.company_name)
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [address, setAddress] = useState(lead.address ?? '')
  const [hasContract, setHasContract] = useState(true) // 거래처는 정기계약이 기본
  const [serviceType, setServiceType] = useState(quote?.serviceName ?? '')
  const [frequency, setFrequency] = useState('')
  const [contractPrice, setContractPrice] = useState(
    quote?.total_amount ? String(quote.total_amount) : ''
  )
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))

  const { execute, isPending } = useAction(createCustomerWithContractAction, {
    onSuccess: () => {
      toast.success('계약 고객으로 등록했어요!')
      // 전환 후 고객 화면으로 이동 (거래처 목록에서는 자동으로 빠짐)
      window.location.replace('/dashboard/clients')
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '다시 시도해주세요')
    },
  })

  // 카카오 주소 검색
  const handleAddressSearch = useCallback(() => {
    const run = () => {
      new (window as unknown as DaumPostcodeWindow).daum!.Postcode({
        oncomplete: (data) => {
          setAddress(data.roadAddress || data.jibunAddress)
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
  }, [])

  const handleSubmit = () => {
    execute({
      name,
      phone,
      address: address || undefined,
      lead_id: lead.id,
      hasContract: hasContract ? 'true' : '',
      service_type: serviceType || undefined,
      frequency: frequency || undefined,
      contract_price: contractPrice || undefined,
      start_date: startDate || undefined,
    })
  }

  // 이미 전환된 거래처
  if (alreadyConverted) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        고객 등록 완료
      </span>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700">
          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
          계약 고객으로 전환
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>계약 고객으로 전환</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-1">
          이 거래처를 계약 고객으로 등록해요. 등록하면 거래처 목록에서 빠지고 고객 관리로 옮겨져요.
        </p>

        <div className="space-y-3">
          {/* 기본 정보 (견적서에서 자동 입력됨) */}
          <div>
            <Label>업체명 (필수)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label>연락처 (필수)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9-]/g, ''))}
              placeholder="010-1234-5678"
              inputMode="tel"
              className="mt-1"
            />
          </div>

          <div>
            <Label>주소</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={address}
                onClick={handleAddressSearch}
                placeholder="주소 찾기 버튼을 눌러주세요"
                readOnly
                className="flex-1 bg-muted/40 cursor-pointer"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-10"
                onClick={handleAddressSearch}
              >
                주소 찾기
              </Button>
            </div>
          </div>

          {/* 정기계약 등록 여부 */}
          <div className="rounded-lg border p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasContract}
                onChange={(e) => setHasContract(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <div>
                <p className="text-sm font-medium">정기계약도 함께 등록할게요</p>
                <p className="text-xs text-muted-foreground">매달 방문하는 계약이면 체크하세요</p>
              </div>
            </label>

            {hasContract && (
              <div className="space-y-3 pt-1 border-t">
                <div>
                  <Label>서비스 내용</Label>
                  <Input
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    placeholder="예: 사무실 정기청소"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>방문 주기</Label>
                  {quote?.frequency && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      견적서 주기: {quote.frequency}
                    </p>
                  )}
                  <div className="mt-1">
                    <FrequencyPicker value={frequency} onChange={setFrequency} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>월 계약금액 (원)</Label>
                    <Input
                      value={contractPrice ? Number(contractPrice).toLocaleString('ko-KR') : ''}
                      onChange={(e) => setContractPrice(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="700,000"
                      inputMode="numeric"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>계약 시작일</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isPending || !name || !phone}
            className="w-full h-12"
          >
            {isPending ? '등록 중...' : '계약 고객으로 등록하기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
