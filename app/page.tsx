import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PAID_PLANS, formatPrice } from '@/lib/config/plans'
import { ClipboardList, CalendarCheck, MessageCircle, Check, Star } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'

// 루트 페이지 — 로그인 상태면 대시보드로, 아니면 랜딩 페이지 표시
export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()
    redirect(profile?.business_id ? '/dashboard' : '/onboarding')
  }

  // 비로그인 사용자에게 랜딩 페이지 표시
  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* 헤더 */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-xl">퀄리오</span>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground transition-colors">요금제</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">로그인</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">무료로 시작</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* 히어로 */}
        <section className="max-w-6xl mx-auto px-6 py-24 text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
            동네 청소업체도<br />
            <span className="text-primary">프리미엄처럼</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            퀄리오로 견적·예약·알림을 한 번에 관리하세요.<br />
            고객은 링크 하나로 견적을 받고, 사장님은 카카오 알림톡으로 바로 확인합니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/pricing">
              <Button size="lg" className="w-full sm:w-auto">요금제 보기</Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">시작하기</Button>
            </Link>
          </div>
        </section>

        {/* 기능 3가지 */}
        <section className="bg-muted/30 border-y">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <h2 className="text-2xl font-bold text-center mb-12">
              청소업체 운영에 꼭 필요한 기능만
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: ClipboardList,
                  title: 'AI 3단계 견적',
                  desc: '고객이 링크를 열면 평수·날짜만 입력해도 Good/Better/Best 3가지 견적이 자동으로 계산됩니다.',
                },
                {
                  icon: CalendarCheck,
                  title: '예약 관리 대시보드',
                  desc: '들어온 예약을 한눈에 확인하고, 진행 상태를 실시간으로 업데이트하세요.',
                },
                {
                  icon: MessageCircle,
                  title: '카카오 알림톡 자동 발송',
                  desc: '예약이 확정되면 고객에게 카카오 알림톡이 자동으로 발송됩니다. 별도 설정 없이 바로 사용 가능합니다.',
                },
              ].map((item) => (
                <div key={item.title} className="bg-card rounded-xl border p-6 space-y-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 요금제 미리보기 */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-center mb-3">합리적인 요금제</h2>
          <p className="text-muted-foreground text-center mb-10">업체 규모에 맞는 플랜을 선택하세요.</p>

          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {PAID_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-xl border p-5 ${
                  plan.highlight ? 'border-primary bg-primary/5 shadow-sm' : 'bg-card'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-4">
                    <span className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      주력
                    </span>
                  </div>
                )}
                <div className="mb-4">
                  <p className="text-sm font-medium">{plan.label}</p>
                  <p className="text-2xl font-bold mt-1">{formatPrice(plan.price)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{plan.target}</p>
                </div>
                <ul className="space-y-1.5">
                  {plan.features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/pricing">
              <Button variant="outline">전체 요금제 비교 보기</Button>
            </Link>
          </div>
        </section>

        {/* CTA 배너 */}
        <section className="bg-primary text-primary-foreground">
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            <h2 className="text-2xl font-bold mb-3">지금 바로 시작하세요</h2>
            <p className="text-primary-foreground/80 mb-8">
              업체 규모에 맞는 플랜을 선택하고 바로 운영을 시작하세요.
            </p>
            <Link href="/pricing">
              <Button size="lg" variant="secondary">
                요금제 확인하기
              </Button>
            </Link>
          </div>
        </section>

      </main>

      {/* 푸터 */}
      <SiteFooter />

    </div>
  )
}
