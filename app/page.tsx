import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PAID_PLANS, formatPrice } from '@/lib/config/plans'
import {
  Check,
  Star,
  ArrowRight,
  Clock,
  MessageCircle,
  Repeat,
  Link2,
  CalendarCheck,
  ShieldCheck,
  Sparkles,
  X,
  TrendingUp,
} from 'lucide-react'
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
            <Link href="#how" className="hover:text-foreground transition-colors">사용 방법</Link>
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

        {/* 히어로 — 결과 중심 헤드라인 + 무료 오퍼를 주 CTA로 */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-20 text-center">
          {/* 대상 명시 뱃지 */}
          <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            청소·홈케어 업체 전용 · 지금 무료 베타
          </div>

          <h1 className="text-4xl md:text-6xl font-bold leading-[1.15] mb-6 break-keep text-balance">
            청소는 사장님이,<br />
            <span className="text-primary">영업은 퀄리오가</span> 합니다.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-9 max-w-2xl mx-auto leading-relaxed break-keep text-pretty">
            견적·예약·카카오 알림톡은 기본, <span className="text-foreground font-semibold">홍보까지 자동으로.</span><br className="hidden sm:block" />
            들어온 일만 정리하는 관리 툴이 아니라, 가만히 있어도 새 손님이 찾아오게 만드는 도구입니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-13 px-8 text-base">
                무료로 시작하기
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-8 text-base">
                요금제 먼저 보기
              </Button>
            </Link>
          </div>

          {/* 리스크 제거 — 가입 문턱 낮추기 */}
          <p className="mt-5 text-sm text-muted-foreground">
            카드 등록 없이 · 1분이면 시작 · 지금은 모든 기능 무료
          </p>
        </section>

        {/* 공감(Pain) — "어, 내 얘기네" 후크 */}
        <section className="bg-muted/30 border-y">
          <div className="max-w-4xl mx-auto px-6 py-16 md:py-20">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-3 break-keep text-balance">
              혹시 이런 적, 있으시죠?
            </h2>
            <p className="text-muted-foreground text-center mb-12 break-keep text-pretty">
              청소는 누구보다 잘하는데, 이런 것들이 매출을 갉아먹습니다.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                '카톡으로 견적 물어봤는데, 일하느라 몇 시간 뒤에 답장 → 손님은 이미 다른 곳에 예약.',
                '예약이 언제 몇 건 있는지 머릿속에만 있어서, 겹치거나 깜빡한 적이 있다.',
                '한 번 온 손님을 다시 부를 방법이 없어, 매번 새 손님만 찾아 헤맨다.',
                '홍보 글·블로그는 써야 하는 건 아는데, 쓸 시간도 방법도 없다.',
              ].map((pain) => (
                <div key={pain} className="flex items-start gap-3 rounded-xl border bg-card p-5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive text-sm font-bold">
                    !
                  </span>
                  <p className="text-sm md:text-base leading-relaxed break-keep">{pain}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-base md:text-lg font-medium mt-10 break-keep text-pretty">
              손님을 놓치는 건 실력이 부족해서가 아닙니다.{' '}
              <span className="text-primary">파는 걸 도와주는 도구</span>가 없어서입니다.
            </p>
          </div>
        </section>

        {/* 차별화 — '관리'가 아니라 '새 매출을 만드는' 툴 (핵심 포지셔닝) */}
        <section className="max-w-5xl mx-auto px-6 py-16 md:py-24">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              퀄리오가 다른 이유
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3 break-keep text-balance">
              정리만 하는 툴은,<br className="sm:hidden" /> 새 손님을 데려오지 못합니다
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto break-keep text-pretty">
              예약·고객 관리는 기본입니다. 퀄리오는 거기서 멈추지 않고, 홍보까지 자동으로 돌려 새 매출이 들어올 길을 만듭니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* 보통의 관리 툴 */}
            <div className="rounded-2xl border bg-muted/20 p-7">
              <p className="font-semibold text-muted-foreground mb-5">보통의 관리 프로그램</p>
              <ul className="space-y-3">
                {[
                  '들어온 예약·고객을 정리만 해줌',
                  '홍보 글·블로그는 여전히 사장님 몫',
                  '있는 손님만 관리, 새 손님은 알아서 찾아야',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm md:text-base text-muted-foreground break-keep">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15">
                      <X className="h-3 w-3 text-muted-foreground" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* 퀄리오 */}
            <div className="rounded-2xl border-2 border-primary bg-primary/5 p-7">
              <p className="font-semibold text-primary mb-5">퀄리오</p>
              <ul className="space-y-3">
                {[
                  '예약·고객 관리는 기본으로 자동',
                  '마케팅 전문가 데이터로 홍보 글을 대신 써서 검색에 노출 → 새 문의가 들어옴',
                  '다녀간 단골을 알아서 다시 불러 재구매까지',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm md:text-base font-medium break-keep">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-6 rounded-lg bg-primary/10 px-4 py-3 text-sm font-semibold text-primary text-center break-keep">
                사장님이 자는 동안에도, 마케팅은 계속 돌아갑니다
              </p>
            </div>
          </div>
        </section>

        {/* 사용 방법(Mechanism) — 3단계로 신뢰 확보 */}
        <section id="how" className="max-w-6xl mx-auto px-6 py-16 md:py-24 scroll-mt-20">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3 break-keep text-balance">
            링크 하나면, 나머지는 퀄리오가 알아서
          </h2>
          <p className="text-muted-foreground text-center mb-14 break-keep text-pretty">
            새로 배울 것도, 복잡한 설정도 없습니다. 카카오톡 쓸 줄 알면 충분해요.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                icon: Link2,
                title: '견적 링크만 보내세요',
                desc: '손님이 링크를 열어 평수·날짜만 고르면, Good/Better/Best 3가지 견적이 자동으로 만들어집니다. 사장님이 밤에 견적서 쓸 필요가 없어요.',
              },
              {
                step: '2',
                icon: CalendarCheck,
                title: '예약이 알아서 쌓입니다',
                desc: '들어온 예약이 한 화면에 정리되고, 확정만 누르면 손님에게 카카오 알림톡이 자동으로 나갑니다. 겹치거나 깜빡할 일이 없어요.',
              },
              {
                step: '3',
                icon: Repeat,
                title: '단골을 다시 불러옵니다',
                desc: '한 번 다녀간 손님에게 재방문 안내와 후기 요청을 퀄리오가 알아서 챙깁니다. 새 손님만 찾아 헤매지 않아도 됩니다.',
              },
            ].map((item) => (
              <div key={item.step} className="relative rounded-2xl border bg-card p-7">
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                    {item.step}
                  </span>
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2 break-keep">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed break-keep">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 핵심 가치 — 결과 중심 벤핏 스트립 */}
        <section className="bg-primary/5 border-y">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <div className="grid sm:grid-cols-3 gap-8 text-center">
              {[
                {
                  icon: Clock,
                  title: '견적 응답, 몇 시간 → 몇 초',
                  desc: '손님이 기다리다 떠나기 전에, 링크가 대신 답합니다.',
                },
                {
                  icon: MessageCircle,
                  title: '알림톡 자동 발송',
                  desc: '예약 확정·방문 안내가 카카오톡으로 자동. 채널 가입도 필요 없어요.',
                },
                {
                  icon: Sparkles,
                  title: '홍보 글까지 자동으로',
                  desc: '검색에 노출되는 업체 홍보 글을 퀄리오가 대신 써서 올려줍니다.',
                },
              ].map((item) => (
                <div key={item.title} className="space-y-2">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-background border flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold break-keep">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed break-keep text-pretty">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 요금제 미리보기 — 무료 베타 먼저 강조 + 토스 심사용 결제 조건 명시 */}
        <section className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3 break-keep text-balance">
            지금은 무료, 요금은 나중에 골라도 됩니다
          </h2>
          <p className="text-muted-foreground text-center mb-4 break-keep text-pretty">
            베타 기간에는 모든 기능을 제한 없이 무료로 써보세요. 마음에 들면 그때 플랜을 고르시면 됩니다.
          </p>
          {/* 결제 조건 명시 — /pricing 과 일관 (전자상거래법·토스 심사 요건) */}
          <p className="text-xs text-muted-foreground text-center mb-10">
            유료 전환 시: 결제 1건당 1개월(30일) 이용 · 자동 갱신 없음 · 언제든지 해지 가능
          </p>

          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {PAID_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-xl border p-6 ${
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
                  <p className="text-xs text-muted-foreground mt-1">1회 결제 시 1개월(30일) 이용</p>
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

        {/* 안심 요소 — 리스크 리버설 */}
        <section className="border-t">
          <div className="max-w-4xl mx-auto px-6 py-12">
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { icon: ShieldCheck, text: '카드 등록 없이 무료로 시작' },
                { icon: Repeat, text: '자동 갱신 없음 · 언제든 해지' },
                { icon: Check, text: '유료 전환 후 7일 이내 전액 환불' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3 justify-center sm:justify-start">
                  <item.icon className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA 배너 — 마지막 밀어주기 */}
        <section className="bg-primary text-primary-foreground">
          <div className="max-w-4xl mx-auto px-6 py-20 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 break-keep text-balance">
              손님 놓치는 오늘 하루가, 제일 아깝습니다
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto break-keep text-pretty">
              지금 무료로 시작해서, 견적·예약·단골 관리를 퀄리오에 맡겨보세요. 마음에 안 들면 그냥 안 쓰시면 됩니다.
            </p>
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="h-13 px-8 text-base">
                무료로 시작하기
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="mt-4 text-sm text-primary-foreground/70">
              카드 등록 없이 · 1분이면 시작
            </p>
          </div>
        </section>

      </main>

      {/* 푸터 */}
      <SiteFooter />

    </div>
  )
}
