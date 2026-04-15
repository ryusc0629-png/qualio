import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLANS, PAID_PLANS, formatPrice } from '@/lib/config/plans'

export const metadata: Metadata = {
  title: '요금제 | 퀄리오',
  description: '퀄리오 구독 요금제 안내 — Starter, Pro, Scale',
}

// 공개 가격 안내 페이지 — 토스페이먼츠 심사 필수
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
                q: '플랜은 언제든지 변경할 수 있나요?',
                a: '네, 언제든지 업그레이드하거나 다운그레이드할 수 있습니다. 변경 사항은 다음 결제일부터 적용됩니다.',
              },
              {
                q: '환불은 어떻게 되나요?',
                a: '결제 후 7일 이내 미사용 시 전액 환불이 가능합니다. 이용 내역이 있는 경우 남은 기간 일할 계산으로 환불됩니다.',
              },
              {
                q: '베타 기간이 끝나면 어떻게 되나요?',
                a: '베타 기간 종료 1개월 전에 이메일로 안내드립니다. 유료 플랜으로 전환하지 않으면 서비스 이용이 제한될 수 있습니다.',
              },
              {
                q: '결제 수단은 무엇을 지원하나요?',
                a: '신용카드, 체크카드를 지원합니다. 토스페이먼츠를 통해 안전하게 처리됩니다.',
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
      <footer className="border-t mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© 2026 퀄리오 | 상호: 다트챌린지 | All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground transition-colors">이용약관</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">개인정보처리방침</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
