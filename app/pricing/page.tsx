import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLANS, PAID_PLANS, formatPrice } from '@/lib/config/plans'
import { SiteFooter } from '@/components/site-footer'

export const metadata: Metadata = {
  title: '요금제 | 퀄리오',
  description: '퀄리오 구독 요금제 안내 — Starter, Pro, Scale',
}

// 공개 가격 안내 페이지 — 포트원(PortOne) 결제 심사 필수
export default function PricingPage() {
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
        </div>

        {/* 결제 방식 안내 — 정기결제(자동결제) 심사 요건 */}
        <div className="max-w-2xl mx-auto mb-10 rounded-lg border border-border bg-muted/40 px-6 py-4 text-sm text-muted-foreground text-center">
          <p>
            <span className="font-semibold text-foreground">결제 방식:</span> 등록한 카드로 <span className="font-semibold text-foreground">매월 자동 결제</span>되는 정기 구독 서비스 · 언제든지 해지 가능 · 해지 시 다음 결제일부터 청구되지 않습니다
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
                <p className="text-xs text-muted-foreground mb-1">{plan.tagline}</p>
                <h2 className="text-2xl font-bold mb-1">{plan.label}</h2>
                <div className="text-3xl font-bold mb-2">
                  {formatPrice(plan.price)}
                </div>
                {/* 매월 자동 결제(정기결제) 명시 */}
                <p className="text-xs text-muted-foreground mb-1">매월 자동 결제 · 언제든 해지</p>
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
                q: '요금은 어떻게 청구되나요?',
                a: '등록하신 카드로 매월 결제일에 자동으로 결제되는 정기 구독(자동결제) 서비스입니다. 첫 결제일을 기준으로 매월 같은 날 자동 결제되며, 해지하시기 전까지 매월 갱신됩니다.',
              },
              {
                q: '플랜은 언제든지 변경할 수 있나요?',
                a: '네, 언제든지 업그레이드하거나 다운그레이드할 수 있습니다. 변경 사항은 다음 결제일부터 적용됩니다.',
              },
              {
                q: '해지는 어떻게 하나요?',
                a: '대시보드 설정에서 언제든지 해지할 수 있습니다. 해지하면 다음 결제일부터 자동 결제가 중단되며, 이미 결제하신 이용 기간은 만료일까지 그대로 이용하실 수 있습니다. 위약금은 없습니다.',
              },
              {
                q: '환불은 어떻게 되나요?',
                a: '결제 후 7일 이내 서비스를 이용하지 않으셨다면 전액 환불이 가능합니다. 이용 내역이 있는 경우 남은 기간을 일할 계산하여 환불합니다. 해지하시면 다음 결제분부터는 자동으로 청구가 중단됩니다.',
              },
              {
                q: '결제 수단은 무엇을 지원하나요?',
                a: '신용카드, 체크카드 자동결제(정기결제)를 지원합니다. 등록하신 카드로 매월 자동 결제되며, 결제대행사 포트원(코리아포트원)을 통해 안전하게 처리됩니다.',
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
