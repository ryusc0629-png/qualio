import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

// 카드 청구가 실패한 뒤 유예로 버티는 동안 대시보드 맨 위에 띄우는 안내 띠.
//
// 왜 필요한가:
// 청구 실패 → past_due → 7일 뒤 잠김. 그런데 그동안 화면에 아무 표시가 없어서,
// 사장님은 평소처럼 쓰다가 8일째 갑자기 결제 화면으로 튕긴다. 문자·푸시를 놓친 분에게는
// 이 띠가 마지막 안전망이다. 남은 날을 숫자로 보여줘 "언제까지"를 분명히 한다.

interface PaymentIssueBannerProps {
  daysLeft: number | null
}

export function PaymentIssueBanner({ daysLeft }: PaymentIssueBannerProps) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">카드 결제가 되지 않았어요</p>
          <p className="text-sm text-amber-900/80 mt-1 leading-relaxed">
            카드 유효기간이 지났거나 한도를 넘은 경우가 많아요. 지금은 그대로 쓰실 수 있어요.
            {typeof daysLeft === 'number' && (
              <>
                {' '}
                <b>{daysLeft}일</b> 안에 카드를 다시 등록해주시면 계속 이어집니다.
              </>
            )}
          </p>
          <Link
            href="/upgrade"
            className="inline-flex items-center justify-center h-12 px-5 mt-3 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
          >
            카드 다시 등록하기
          </Link>
        </div>
      </div>
    </div>
  )
}
