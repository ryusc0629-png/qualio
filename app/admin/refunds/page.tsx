import { getRefundablePayments } from '@/lib/admin/refunds'
import { RefundList } from './refund-list'

// 본사 환불 처리 화면.
// 절차를 따로 문서로 만들지 않고 화면 안에 적는다 — 문서는 아무도 안 열어보고 금방 낡는다.

export const dynamic = 'force-dynamic'

export default async function AdminRefundsPage() {
  const payments = await getRefundablePayments()

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">환불 처리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          결제된 건을 환불합니다. 여기서 처리하면 카드 환불과 우리 기록이 함께 맞춰져요.
        </p>
      </div>

      {/* 절차 — 이용약관 제6조를 그대로 옮긴 것 */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-semibold">환불은 이렇게 처리해요</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4 leading-relaxed">
          <li>고객이 전화(010-2912-2881)·이메일(ceo@qualio.co.kr)·서비스 내 문의로 환불을 요청해요.</li>
          <li>아래 목록에서 그 업체의 결제 건을 찾아 <b>환불 처리하기</b>를 눌러요.</li>
          <li>이용 내역을 확인하고 골라요. 금액은 약관 규칙대로 자동 계산돼요 — 직접 적지 마세요.</li>
          <li>환불 사유를 적고 누르면 카드로 환불이 나가요. 고객 카드사 기준 <b>영업일 3~5일</b> 걸려요.</li>
        </ol>
        <p className="text-xs text-muted-foreground pt-1 border-t leading-relaxed">
          <b>금액 규칙</b> · 결제 후 7일 이내 + 이용 안 했으면 <b>전액</b>. 이용했으면 <b>남은 기간만큼 일할 계산</b>.
          서비스 장애·중복 결제 등 우리 잘못이면 이용 여부와 관계없이 <b>전액</b>.
        </p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
          ⚠️ 포트원 콘솔에서 직접 환불하지 마세요. 카드는 환불돼도 우리 기록은 &lsquo;결제됨&rsquo;으로 남아
          매출이 실제보다 부풀려져요.
        </p>
      </div>

      <RefundList payments={payments} />
    </div>
  )
}
