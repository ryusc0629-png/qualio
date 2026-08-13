'use client'

import { useTransition } from 'react'
import { quoteSupplyAmount } from '@/lib/quote/amount'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { B2bQuoteForm } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/b2b-quote-form'
import { AddBookingButton } from '@/components/dashboard/add-booking-button'
import { deleteB2bQuoteAction, duplicateB2bQuoteAction } from '@/lib/actions/b2b-quotes'
import { FileText, Plus, Pencil, Eye, Trash2, Link2, Copy } from 'lucide-react'

// b2b-quote-form.tsx의 ExistingQuote와 동일한 형태 (한 장의 견적서)
export interface B2bQuote {
  id: string
  public_token: string | null
  title: string | null
  quote_number: string | null
  valid_until: string | null
  items: { name: string; unit: string; qty: number; unit_price: number }[]
  total_amount: number
  tax_included: boolean
  conditions: string | null
  site_name: string | null
  site_address: string | null
  site_area: string | null
  frequency: string | null
  worker_count: number | null
  spec_content: string | null
  contract_content: string | null
  job_type: string | null
  amount_mode?: string | null
  discount_type?: string | null
  discount_value?: number | null
}

interface Props {
  quotes: B2bQuote[]
  // 리드(영업 중) 또는 고객(계약 중) 중 하나에 연결
  leadId?: string
  customerId?: string
  clientName: string
  // 고객(계약 중) 화면일 때만 넘어옴 — 있으면 견적서로 바로 일정(예약)을 잡을 수 있음
  customerPhone?: string | null
  // 등록된 주소(리드·거래처 공통) — 새 견적서의 '현장 주소'를 자동으로 채우는 데 쓴다
  customerAddress?: string | null
  // 우리 업체명(을) — 계약서 첫 문장에 자동 반영
  businessName?: string
  // 새 견적서에 자동 부여될 다음 순번(미리보기용) — 서버가 저장 시 최종 확정
  suggestedQuoteNumber?: string
  hasMeeting?: boolean
  // 상담 기록을 불러올 리드 id(자동채우기 소스) — 거래처 허브에서 전환 전 리드(customer.lead_id) 전달용
  meetingLeadId?: string
}

// 한 거래처에 여러 장의 견적서를 만들고 각각 수정·미리보기·삭제할 수 있는 목록
export function B2bQuoteList({ quotes, leadId, customerId, clientName, customerPhone, customerAddress, businessName, suggestedQuoteNumber, hasMeeting, meetingLeadId }: Props) {
  // 고객 화면(customerId+연락처)일 때만 견적서→일정 잡기 버튼 노출 (리드 화면엔 예약 개념 없음)
  const canSchedule = Boolean(customerId && customerPhone)
  const router = useRouter()
  const [, startTransition] = useTransition()

  const { execute: executeDelete, isPending: deleting } = useAction(deleteB2bQuoteAction, {
    onSuccess: () => {
      toast.success('견적서를 삭제했어요')
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const { execute: executeDuplicate, isPending: duplicating } = useAction(duplicateB2bQuoteAction, {
    onSuccess: () => {
      toast.success('견적서를 복사했어요! 목록에서 (복사)본을 수정하세요')
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const handleDelete = (quote: B2bQuote) => {
    // 시방서·계약서가 함께 보관된 견적서는 삭제 시 그 문서들도 영구 삭제되므로 더 강하게 경고
    const hasDocs = Boolean(quote.spec_content || quote.contract_content)
    const message = hasDocs
      ? '이 견적서에는 시방서·계약서가 함께 보관돼 있어요.\n삭제하면 계약서·시방서까지 영구 삭제되어 되돌릴 수 없어요.\n정말 삭제할까요?'
      : '이 견적서를 삭제할까요?\n삭제하면 되돌릴 수 없어요.'
    if (!window.confirm(message)) return
    executeDelete({ quoteId: quote.id, leadId, customerId })
  }

  // 고객에게 보낼 공개 링크 복사 — 이 링크만 보내면 고객이 견적서·시방서를 열람
  const copyCustomerLink = async (token: string) => {
    const url = `${window.location.origin}/quote/${token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('고객 링크를 복사했어요! 카톡·문자로 붙여넣어 보내세요')
    } catch {
      window.prompt('아래 링크를 복사해서 고객에게 보내세요', url)
    }
  }

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          견적서·시방서
          {quotes.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">{quotes.length}장</span>
          )}
        </h2>
        <B2bQuoteForm
          leadId={leadId}
          customerId={customerId}
          clientName={clientName}
          clientAddress={customerAddress}
          businessName={businessName}
          existingQuote={null}
          suggestedQuoteNumber={suggestedQuoteNumber}
          hasMeeting={hasMeeting}
          meetingLeadId={meetingLeadId}
          trigger={
            <Button size="sm" className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1" />
              새 견적서 만들기
            </Button>
          }
        />
      </div>

      {quotes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">아직 만든 견적서가 없어요</p>
          <p className="text-xs text-muted-foreground mt-1">
            위 &lsquo;새 견적서 만들기&rsquo;로 이 거래처에 보낼 견적서를 만들어요
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((quote) => {
            // 카드 제목 — 사장님이 붙인 이름 우선, 없으면 현장명·첫 서비스명·견적번호 순
            const title =
              quote.title?.trim() ||
              quote.site_name?.trim() ||
              quote.items[0]?.name?.trim() ||
              quote.quote_number ||
              '견적서'
            const isOneOff = quote.job_type === 'one_off'
            return (
              <div key={`${quote.id}-${quote.total_amount}`} className="rounded-lg border p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        isOneOff ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isOneOff ? '일회성' : '정기'}
                    </span>
                    <p className="font-medium text-sm truncate">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {quote.quote_number ? `${quote.quote_number} · ` : ''}
                    <span className="font-semibold text-foreground">{quote.total_amount.toLocaleString('ko-KR')}원</span>
                  </p>
                  {/* 시방서·계약서 보관 상태를 눈에 띄게 — 사장님이 '문서가 안전히 있구나' 바로 확인 */}
                  {(quote.spec_content || quote.contract_content) && (
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {quote.spec_content && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                          <FileText className="h-3 w-3" /> 시방서 보관됨
                        </span>
                      )}
                      {quote.contract_content && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-medium">
                          <FileText className="h-3 w-3" /> 계약서 보관됨
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* 일정 잡기 — 이 견적서 작업을 달력(예약)에 바로 올림. 서비스명·금액 자동 채움, 날짜만 선택 */}
                  {canSchedule && (
                    <AddBookingButton
                      customer={{ name: clientName, phone: customerPhone ?? null, address: customerAddress ?? null }}
                      prefill={{ cleaning_type: title, final_price: quoteSupplyAmount(quote), vatRemoved: quote.tax_included }}
                      triggerLabel="일정 잡기"
                      triggerVariant="outline"
                      triggerIcon="calendar"
                      triggerClassName="h-8 px-2 text-xs"
                    />
                  )}
                  {/* 수정 — 이 견적서 내용을 그대로 불러와 편집 */}
                  <B2bQuoteForm
                    leadId={leadId}
                    customerId={customerId}
                    clientName={clientName}
                    clientAddress={customerAddress}
                    businessName={businessName}
                    existingQuote={quote}
                    hasMeeting={hasMeeting}
                    meetingLeadId={meetingLeadId}
                    trigger={
                      <button
                        type="button"
                        className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                        aria-label="견적서 수정"
                        title="수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    }
                  />
                  {/* 견적서 복제 — 이 견적서를 그대로 복사해 '(복사)'본을 새로 만듦(다른 현장·수정본용) */}
                  <button
                    type="button"
                    onClick={() => executeDuplicate({ quoteId: quote.id, leadId, customerId })}
                    disabled={duplicating}
                    className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted disabled:opacity-40"
                    aria-label="견적서 복제"
                    title="견적서 복제 (복사본 만들기)"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {/* 고객 링크 복사 — 고객에게 보낼 공개 링크를 바로 복사(보내기만 하면 고객이 열람) */}
                  {quote.public_token && (
                    <button
                      type="button"
                      onClick={() => copyCustomerLink(quote.public_token!)}
                      className="p-2 text-muted-foreground hover:text-primary rounded-md hover:bg-muted"
                      aria-label="고객 링크 복사"
                      title="고객 링크 복사"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                  )}
                  {/* 미리보기 — 같은 탭에서 공개 페이지로 이동(새 탭 X).
                      사파리는 '사이트가 연 새 탭'을 인쇄하면 백지가 되는 버그가 있어,
                      같은 탭에서 열어야 PDF 저장이 정상 동작함. 되돌아갈 땐 브라우저 뒤로가기. */}
                  {quote.public_token && (
                    <a
                      href={`/quote/${quote.public_token}?preview=1`}
                      className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                      aria-label="견적서 미리보기"
                      title="미리보기 (PDF 저장)"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
                  )}
                  {/* 삭제 */}
                  <button
                    type="button"
                    onClick={() => handleDelete(quote)}
                    disabled={deleting}
                    className="p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted disabled:opacity-40"
                    aria-label="견적서 삭제"
                    title="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
