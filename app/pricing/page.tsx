import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PAID_PLANS, formatPrice, formatPriceWithVat } from '@/lib/config/plans'
import { SiteFooter } from '@/components/site-footer'
import { BETA_SEATS, BETA_LIFETIME_DISCOUNT_RATE, applyLifetimeDiscount, LAUNCH_DATE_LABEL, isBeforeLaunch } from '@/lib/config/beta'
import { getRemainingBetaSeats } from '@/lib/payments/pricing'
import { BILLING_COPY } from '@/lib/config/billing'

export const metadata: Metadata = {
  title: '요금제 | 퀄리오',
  description: '퀄리오 구독 요금제 안내 — 시작·성장·확장',
}

// 남은 자리 수는 5분마다 갱신 — 가입이 몰려도 DB를 매 요청 때리지 않게
export const revalidate = 300

// 공개 가격 안내 페이지 — 포트원(PortOne) 결제 심사 필수
export default async function PricingPage() {
  // 베타 100팀 평생 할인 — 광고에서 약속한 내용을 요금제 화면에서도 그대로 보여준다
  const remainingSeats = await getRemainingBetaSeats()
  const beforeLaunch = isBeforeLaunch()
  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">퀄리오</Link>
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">로그인</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">무료로 시작</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* 타이틀 */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">합리적인 요금제</h1>
          <p className="text-lg text-muted-foreground">
            업체 규모에 맞는 플랜을 선택하세요. 언제든지 변경 가능합니다.
          </p>
          {/* 정식 런칭일 — 언제부터 이 요금이 청구되는지 요금표 맨 위에서 밝힌다 */}
          <p className="mt-3 text-sm">
            <span className="font-semibold">{LAUNCH_DATE_LABEL} 정식 런칭</span>
            {beforeLaunch && (
              <span className="text-muted-foreground"> — 그때까지는 모든 기능 무료, 요금은 런칭 후부터 청구돼요</span>
            )}
          </p>
        </div>

        {/* 베타 100팀 평생 할인 — 자리가 남아 있을 때만 노출 (마감되면 조용히 사라짐) */}
        {remainingSeats > 0 && (
          <div className="max-w-2xl mx-auto mb-6 rounded-xl border border-primary/30 bg-primary/5 px-6 py-5 text-center">
            <p className="text-sm font-semibold text-primary">
              베타 {BETA_SEATS}팀 · 평생 {BETA_LIFETIME_DISCOUNT_RATE}% 할인 — {remainingSeats}자리 남았어요
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">
              지금 가입하시면 베타 기간은 전 기능 무료로 쓰시고, 유료로 바뀐 뒤에도 아래 정가의 절반만 내시면 됩니다.
              한 번 받은 할인은 플랜을 올려도 계속 유지돼요.
            </p>
            {/* 할인 조건을 처음부터 밝힌다 — 나중에 말이 달라지면 그게 분쟁이 된다 */}
            <p className="text-xs text-muted-foreground mt-2">
              가입 순서대로 자동 적용 · 해지 후 다시 가입하거나 업체를 넘기면 할인은 이어지지 않아요
            </p>
          </div>
        )}

        {/* 서비스 제공기간 안내 — 결제망 심사 필수 고지 (결제 방식은 하단 FAQ·플랜 카드에서 반복 안내) */}
        <div className="max-w-2xl mx-auto mb-10 rounded-lg border border-border bg-muted/40 px-6 py-4 text-sm text-muted-foreground text-center">
          <p>
            <span className="font-semibold text-foreground">서비스 제공기간:</span> {BILLING_COPY.period}
          </p>
        </div>

        {/* 플랜 카드 */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {PAID_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-primary shadow-lg shadow-primary/10 bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              {/* 추천 배지 */}
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    주력 플랜
                  </span>
                </div>
              )}

              {/* 플랜 정보 */}
              <div className="mb-6">
                {plan.tagline && <p className="text-xs text-muted-foreground mb-1">{plan.tagline}</p>}
                <h2 className="text-2xl font-bold mb-1">{plan.label}</h2>
                {/* 주 가격은 항상 정가 — 결제창에 실제로 청구되는 금액(정가 또는 베타 할인가)과
                    이 화면의 큰 숫자가 어긋나면 결제망 심사에서 '가격 고지 불일치'로 걸린다.
                    베타 할인은 아래 한 줄 안내로만 알린다(결제 화면에서 정가 취소선 + 할인가로 다시 보여줌). */}
                <div className="text-3xl font-bold mb-1">
                  {formatPrice(plan.price)}
                  <span className="text-sm font-normal text-muted-foreground ml-1.5">부가세 별도</span>
                </div>
                {/* 표시가는 공급가액이므로, 카드에 실제로 나가는 총액을 반드시 함께 밝힌다 */}
                <p className="text-xs text-muted-foreground mb-2">
                  실제 결제 {formatPriceWithVat(plan.price)}
                </p>
                {remainingSeats > 0 && (
                  <p className="text-xs text-primary font-medium mb-1">
                    베타 {BETA_SEATS}팀은 결제 시 {BETA_LIFETIME_DISCOUNT_RATE}% 할인 —{' '}
                    {formatPrice(applyLifetimeDiscount(plan.price, BETA_LIFETIME_DISCOUNT_RATE))} (부가세 별도,
                    실제 결제 {formatPriceWithVat(applyLifetimeDiscount(plan.price, BETA_LIFETIME_DISCOUNT_RATE))})
                  </p>
                )}
                {/* 결제 방식 — 실제 동작(lib/config/billing.ts)과 항상 같은 문구 */}
                <p className="text-xs text-muted-foreground mb-1">{BILLING_COPY.short}</p>
                <p className="text-sm text-muted-foreground">{plan.target}</p>
                <p className="text-sm font-medium mt-2 text-foreground">{plan.description}</p>
              </div>

              {/* 기능 목록 */}
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link href="/signup">
                <Button
                  className="w-full"
                  variant={plan.highlight ? 'default' : 'outline'}
                >
                  시작하기
                </Button>
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-center mb-8">자주 묻는 질문</h2>
          <div className="space-y-6">
            {[
              {
                q: '지금 가입하면 언제부터 요금이 나가나요?',
                a: `퀄리오 정식 런칭은 ${LAUNCH_DATE_LABEL}입니다. 그전까지는 모든 기능을 무료로 쓰시고, 요금은 런칭 이후 플랜을 고르신 다음부터 청구됩니다. 먼저 오신 ${BETA_SEATS}팀은 유료로 바뀐 뒤에도 평생 ${BETA_LIFETIME_DISCOUNT_RATE}% 할인을 받습니다.`,
              },
              {
                q: '요금은 어떻게 청구되나요?',
                a: BILLING_COPY.faqHow,
              },
              {
                q: '플랜은 언제든지 변경할 수 있나요?',
                a: '네, 언제든지 업그레이드하거나 다운그레이드할 수 있습니다. 변경 사항은 다음 결제일부터 적용됩니다.',
              },
              {
                q: '해지는 어떻게 하나요?',
                a: BILLING_COPY.faqCancel,
              },
              {
                q: '환불은 어떻게 되나요?',
                a: '결제 후 7일 이내 서비스를 이용하지 않으셨다면 전액 환불이 가능합니다. 이용 내역이 있는 경우 남은 기간을 일할 계산하여 환불합니다.',
              },
              {
                q: '표시된 금액에 부가세가 포함되어 있나요?',
                a: `요금표의 금액은 부가세가 빠진 공급가액입니다. 실제로는 여기에 부가세 10%가 더해져 결제됩니다. 예를 들어 시작 플랜은 ${formatPrice(PAID_PLANS[0].price)}에 부가세를 더해 ${formatPriceWithVat(PAID_PLANS[0].price)}이 청구됩니다. 사업자라면 매입세액 공제를 받으실 수 있습니다.`,
              },
              {
                q: '결제 수단은 무엇을 지원하나요?',
                a: BILLING_COPY.faqMethod,
              },
              {
                // 사업자 고객이라 습관적으로 요청한다 — 미리 답해두면 그 문의 자체가 줄어든다
                q: '세금계산서를 발행해 주시나요?',
                a: BILLING_COPY.faqTaxInvoice,
              },
            ].map((item) => (
              <div key={item.q} className="border-b pb-6">
                <h3 className="font-medium mb-2">{item.q}</h3>
                <p className="text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <SiteFooter />
    </div>
  )
}
