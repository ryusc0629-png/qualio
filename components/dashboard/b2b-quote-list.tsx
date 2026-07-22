'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { B2bQuoteForm } from '@/app/(dashboard)/dashboard/pipeline/[leadId]/b2b-quote-form'
import { deleteB2bQuoteAction } from '@/lib/actions/b2b-quotes'
import { FileText, Plus, Pencil, Eye, Trash2 } from 'lucide-react'

// b2b-quote-form.tsx의 ExistingQuote와 동일한 형태 (한 장의 견적서)
export interface B2bQuote {
  id: string
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
  job_type: string | null
}

interface Props {
  quotes: B2bQuote[]
  // 리드(영업 중) 또는 고객(계약 중) 중 하나에 연결
  leadId?: string
  customerId?: string
  clientName: string
  hasMeeting?: boolean
}

// 한 거래처에 여러 장의 견적서를 만들고 각각 수정·미리보기·삭제할 수 있는 목록
export function B2bQuoteList({ quotes, leadId, customerId, clientName, hasMeeting }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const { execute: executeDelete, isPending: deleting } = useAction(deleteB2bQuoteAction, {
    onSuccess: () => {
      toast.success('견적서를 삭제했어요')
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const handleDelete = (quoteId: string) => {
    if (!window.confirm('이 견적서를 삭제할까요?\n삭제하면 되돌릴 수 없어요.')) return
    executeDelete({ quoteId, leadId, customerId })
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
          existingQuote={null}
          hasMeeting={hasMeeting}
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
                    {quote.spec_content ? ' · 시방서 있음' : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* 수정 — 이 견적서 내용을 그대로 불러와 편집 */}
                  <B2bQuoteForm
                    leadId={leadId}
                    customerId={customerId}
                    clientName={clientName}
                    existingQuote={quote}
                    hasMeeting={hasMeeting}
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
                  {/* 미리보기 — 이 견적서만 새 탭에서 열기(링크 복사·PDF 저장은 그 화면에서).
                      껍데기 없는 단독 라우트(/quote-doc)라 인쇄가 항상 정상 동작 */}
                  <a
                    href={`/quote-doc/${quote.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                    aria-label="견적서 미리보기"
                    title="미리보기"
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                  {/* 삭제 */}
                  <button
                    type="button"
                    onClick={() => handleDelete(quote.id)}
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
