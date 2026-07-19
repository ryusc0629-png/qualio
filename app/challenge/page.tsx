import type { Metadata } from 'next'
import { Sparkles, ArrowRight } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { PreRegistrationForm } from './pre-registration-form'

export const metadata: Metadata = {
  title: '청소 창업 90일 챌린지 — 사전 알림 신청 | 퀄리오',
  description:
    '기술은 있는데 오더를 못 따서 남 밑으로, 플랫폼 종속으로 가는 청소 사장님을 위한 도구. 오더 따오는 것부터 운영까지 퀄리오가 다 합니다. 90일 안에 월매출 1,000만 원 도전을 실시간 공개.',
}

// 퀄리오가 대신하는 워크플로우 — 기능이 아니라 '결과의 흐름'으로 쉽게
const WORKFLOW = [
  { emoji: '🏠', title: '사장님 청소업체만의 홈페이지 생성', desc: '포트폴리오·문의는 기본, 글이 자동으로 계속 쌓여 검색·AI 검색 상단에 유리' },
  { emoji: '📣', title: '네이버·당근·인스타 홍보 글 자동 생성', desc: '채널마다 맞춘 글을 알아서 써줘요 — 그대로 올리면 끝' },
  { emoji: '📩', title: '상담·견적·예약까지 자동', desc: '전화 안 받아도, 알아서 상담하고 견적 내고 예약까지 잡아줘요' },
  { emoji: '📅', title: '일정·고객·정기계약 자동 관리', desc: '잡힌 예약과 단골을 한 곳에서 알아서 정리' },
  { emoji: '🔁', title: '단골 재구매 자동 유도', desc: '끝난 고객을 다시 부르고 후기까지' },
]

export default function ChallengeLandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <section className="flex-1">
        <div className="max-w-xl mx-auto px-5 pt-12 pb-10 space-y-6">
          {/* 배지 */}
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full px-3 py-1">
            <Sparkles className="w-4 h-4" /> 90일 챌린지 · 사전 알림
          </div>

          {/* 헤드라인 — 진짜 통증: 기술은 있는데 오더가 없다 */}
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight break-keep">
            기술은 최고인데,
            <br />
            <span className="text-primary">오더</span>는 왜 늘 남의 손에 있을까요?
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed break-keep">
            직접 오더를 못 따면, 실력이 있어도 결국 <b className="text-foreground">남의 팀장</b>으로 들어가거나{' '}
            <b className="text-foreground">숨X·미X·아정X</b> 같은 플랫폼에 매달리게 돼요. 매칭비는 계속 오르고,
            단가 경쟁은 갈수록 심해지죠.
          </p>

          <p className="text-base leading-relaxed break-keep font-medium">
            퀄리오는 <b className="text-primary">오더 따오는 것부터 운영까지 전부 대신</b>합니다. 사장님은{' '}
            <b>기술력만</b> 있으면 돼요.
          </p>

          {/* 워크플로우 — 이 모든 걸 대신합니다 */}
          <div className="space-y-2.5">
            <p className="text-sm font-semibold text-muted-foreground">이 모든 걸 퀄리오가 대신해요</p>
            {WORKFLOW.map(({ emoji, title, desc }) => (
              <div key={title} className="flex items-start gap-3 bg-muted/50 rounded-xl px-4 py-3">
                <span className="text-lg shrink-0">{emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold break-keep">{title}</p>
                  <p className="text-xs text-muted-foreground break-keep">{desc}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1 text-sm font-medium text-primary break-keep">
              <ArrowRight className="w-4 h-4 shrink-0" />
              사장님은 청소만. 오더와 운영은 퀄리오가 다 합니다.
            </div>
          </div>

          {/* 챌린지 증명 프레임 */}
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 space-y-2">
            <p className="font-bold break-keep">정말 되는지, 제가 직접 증명합니다.</p>
            <p className="text-sm text-muted-foreground break-keep">
              기술만 있는 신규 업체를 완전 백지에서 시작해, 퀄리오로{' '}
              <b className="text-foreground">90일 안에 월매출 1,000만 원</b>에 도전합니다. 그 과정을{' '}
              <b className="text-foreground">숫자까지 전부 실시간으로</b> 공개해요.
            </p>
          </div>

          {/* 왜 지금 신청 + 폼 */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="font-bold break-keep">기술은 있는데 오더가 없어 고민이라면</p>
              <p className="text-sm text-muted-foreground break-keep">
                미리 신청해 두세요. 챌린지 결과가 좋으면 신청하신 분들께{' '}
                <b className="text-foreground">가장 먼저 알림</b>을 드려요.{' '}
                <b className="text-foreground">첫 달 무료 · 가격 평생 고정</b>.
              </p>
            </div>
            <PreRegistrationForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
