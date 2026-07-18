import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { PreRegistrationForm } from './pre-registration-form'

export const metadata: Metadata = {
  title: '청소 창업 90일 챌린지 — 1기 사전신청 | 퀄리오',
  description:
    '광고 없이 0에서 시작해 90일 안에 월매출 1,000만 원까지. 그 과정을 숫자까지 실시간으로 공개합니다. 결과가 좋으면 1기로 가장 먼저 연락드려요.',
}

const VALUE_POINTS = [
  { emoji: '📈', text: '반복되는 홍보·글 발행은 자동으로 — 사장님은 영업에만 집중' },
  { emoji: '🔍', text: '검색·AI 검색에 내 업체가 노출되게 자동 세팅' },
  { emoji: '🎬', text: '실제 매출이 오르는 과정을 이 채널에서 그대로 확인' },
]

export default function ChallengeLandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <section className="flex-1">
        <div className="max-w-xl mx-auto px-5 pt-12 pb-10 space-y-6">
          {/* 배지 */}
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full px-3 py-1">
            <Sparkles className="w-4 h-4" /> 90일 챌린지 · 1기 모집
          </div>

          {/* 헤드라인 */}
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight break-keep">
            광고 없이 <span className="text-primary">0에서</span>,<br />
            90일 안에 <span className="text-primary">월매출 1,000만 원</span>
            <br />
            만들 수 있을까?
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed break-keep">
            청소 기술은 밑바닥, 시작은 완전 백지. 대신 운영은 전부 자동화하고 영업에만 집중합니다.
            그 90일을 <b className="text-foreground">숫자까지 전부 실시간으로 공개</b>해요.
          </p>

          {/* 가치 3줄 */}
          <div className="space-y-2.5">
            {VALUE_POINTS.map(({ emoji, text }) => (
              <div key={text} className="flex items-start gap-3 bg-muted/50 rounded-xl px-4 py-3">
                <span className="text-lg shrink-0">{emoji}</span>
                <p className="text-sm font-medium leading-snug break-keep">{text}</p>
              </div>
            ))}
          </div>

          {/* 왜 지금 신청? */}
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 space-y-2">
            <p className="font-bold break-keep">“만약 이 방법으로 내 매출도 자동으로 오른다면?”</p>
            <p className="text-sm text-muted-foreground break-keep">
              미리 사전신청해 두세요. 챌린지 결과가 좋으면, 신청하신 분들께{' '}
              <b className="text-foreground">1기로 가장 먼저</b> 사용 안내를 드립니다. 지금 신청하면{' '}
              <b className="text-foreground">첫 달 무료 · 1기 가격 평생 고정</b>.
            </p>
          </div>

          {/* 신청 폼 */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <PreRegistrationForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
