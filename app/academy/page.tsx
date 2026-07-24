import type { Metadata } from 'next'
import { GraduationCap, ArrowRight, TrendingUp, LineChart, Award, ShieldAlert, Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteFooter } from '@/components/site-footer'
import { AcademyInquiryForm } from './academy-inquiry-form'

// 검색 노출을 원하므로 noindex 미적용 — 학원이 검색으로도 찾아올 수 있게 SEO 메타 강화
export const metadata: Metadata = {
  title: '기술 창업 학원 제휴 — 마케팅 교육은 전문팀에 맡기세요 | 퀄리오',
  description:
    '기술은 학원이 제대로 가르칩니다. 하지만 마케팅·영업 커리큘럼은 대개 얕죠. 청소업 마케팅 전문팀 퀄리오가 검증된 운영 교육과 자동화 시스템을 학원 커리큘럼에 심어드립니다. 학원은 기술 교육에만 집중하고, 성공한 졸업생으로 명문이 되세요. 제휴 문의를 남겨주세요.',
  keywords: [
    '기술 창업 학원 제휴',
    '청소 창업 교육',
    '직업전문학교 제휴',
    '학원 마케팅 커리큘럼',
    '수료생 창업 지원',
    '퀄리오 제휴',
  ],
  openGraph: {
    title: '기술 창업 학원 제휴 — 마케팅 교육은 전문팀에 맡기세요',
    description:
      '학원은 기술 교육에 집중하고, 마케팅·운영은 광고 전문팀 퀄리오가. 성공한 졸업생이 곧 학원의 포트폴리오가 됩니다.',
    type: 'website',
  },
}

// 학원의 현실 — 강점은 확실하나, 마케팅 수업이 부실하다는 '진짜 빈칸'
const GAPS = [
  {
    stat: '기술 교육',
    label: '학원의 확실한 강점',
    desc: '원하는 기술을 제대로 가르치니, 후기가 나쁠 일이 없어요. 여긴 손댈 필요 없습니다.',
  },
  {
    stat: '마케팅 수업',
    label: '대개 아쉬운 것',
    desc: "만들어는 두셨죠. 하지만 광고를 전문으로 파본 팀이 짠 게 아니라 깊이가 얕습니다.",
  },
  {
    stat: '무너지는 신뢰',
    label: '그래서 생기는 위험',
    desc: '배운 대로 해도 오더가 안 나오면, 신뢰를 잃는 건 결국 학원이에요.',
  },
]

// 학원 커리큘럼에 심어드리는 것 — 결과 중심(상세 목차·조건은 미팅에서)
const IMPLANT = [
  {
    icon: LineChart,
    title: '광고 전문팀이 짠 운영 교육',
    desc: '청소업 마케팅만 전문으로 파온 팀의 검증된 운영 커리큘럼을, 귀 학원 수업에 그대로 임베드합니다.',
  },
  {
    icon: TrendingUp,
    title: '수강생용 자동화 시스템',
    desc: '견적→예약→결제→알림톡→후기까지, 수강생이 졸업과 동시에 굴러가는 실전 도구를 제공합니다.',
  },
  {
    icon: GraduationCap,
    title: '학원은 기술에만 집중',
    desc: '마케팅·영업은 전문팀이 맡으니, 학원은 가장 잘하는 기술 교육에만 집중하시면 됩니다.',
  },
]

// 실제 카페 수강생 후기(제목 그대로 인용) — 클릭하면 카페에서 날짜·댓글까지 검증 가능
const CAFE_REVIEWS_URL = 'https://cafe.naver.com/f-e/cafes/31123207/menus/24'
const REVIEWS = [
  '4개월 만에 연매출 2억, 월소득 680만 원 달성',
  '3개월 만에 월 매출 1,300만 원 상승 — 결과로 증명',
  '250평 정기청소, 대형 인테리어 업체와 계약',
  '제안서라는 무기가 생기니 영업이 간단하네요',
]

export default function AcademyPartnershipPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <section className="flex-1">
        <div className="max-w-xl mx-auto px-5 pt-12 pb-10 space-y-8">
          {/* 배지 */}
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full px-3 py-1">
            <GraduationCap className="w-4 h-4" /> 기술 창업 학원 제휴 안내
          </div>

          {/* 헤드라인 — 기술은 명문, 문제는 부실한 마케팅 수업 */}
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight break-keep">
            기술은 명문인데,
            <br />
            <span className="text-primary">마케팅 수업</span>은
            <br />
            왜 늘 아쉬울까요?
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed break-keep">
            기술 교육은 학원의 자부심이죠. 원하는 기술을 확실히 알려주니{' '}
            <b className="text-foreground">후기가 나쁠 일도 없고요</b>. 문제는 그 다음입니다.
            마케팅·영업 커리큘럼은 대개 <b className="text-foreground">‘만들어는 둔’ 수준</b> —
            광고를 전문으로 파본 팀이 짠 게 아니니까요.
          </p>

          {/* 데이터로 보는 현실 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GAPS.map(({ stat, label, desc }) => (
              <div key={stat} className="rounded-xl border bg-muted/40 p-4 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                <p className="text-lg font-bold text-foreground break-keep">{stat}</p>
                <p className="text-xs text-muted-foreground break-keep">{desc}</p>
              </div>
            ))}
          </div>

          {/* 위험 경고 — 어설픈 마케팅이 학원을 위험하게 한다(악용 사례 대비, 톤은 절제) */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-900/80 break-keep leading-relaxed">
              마케팅 대행을 명목으로 수강생에게 수백만 원을 받는 곳도 있습니다. 당장은 돈이 되지만,
              <b className="text-amber-900"> 학원의 평판은 그렇게 무너져요.</b> 마케팅은 어설프게
              손대면 오히려 신뢰를 잃는 전문 영역입니다.
            </p>
          </div>

          <p className="text-base leading-relaxed break-keep font-medium">
            애매한 마케팅·영업은, <b className="text-primary">광고 전문팀 퀄리오에 맡기세요.</b>{' '}
            학원은 가장 잘하는 것 — 기술 교육 — 에만 집중하시면 됩니다.
          </p>

          {/* 심어드리는 것 */}
          <div className="space-y-4 pt-2">
            <p className="text-lg sm:text-xl font-bold text-foreground">
              귀 학원 커리큘럼에 이렇게 붙습니다
            </p>
            <div className="space-y-2.5">
              {IMPLANT.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 bg-muted/50 rounded-xl px-4 py-3"
                >
                  <Icon className="w-5 h-5 shrink-0 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-keep">{title}</p>
                    <p className="text-xs text-muted-foreground break-keep">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 pt-4 text-base sm:text-lg font-bold text-primary break-keep">
              <ArrowRight className="w-5 h-5 shrink-0 mt-0.5" />
              <span>
                학원은 기술을,
                <br />
                마케팅과 운영은 퀄리오가 책임집니다.
              </span>
            </div>
          </div>

          {/* 반론 방어 — "수강생 잘되면 시장 작아지는 것 아니냐"에 대한 답 */}
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <p className="font-bold break-keep">
                수강생이 잘되면 시장이 작아질까요? 반대입니다.
              </p>
            </div>
            <p className="text-sm text-muted-foreground break-keep leading-relaxed">
              “폐업하는 사람이 있어야 창업하는 사람이 생긴다”는 말, 반은 맞고 반은 틀립니다.{' '}
              <b className="text-foreground">명문 학원은 ‘성공한 졸업생’으로 만들어져요.</b> 전국 각지에서
              잘 운영되는 수강생 한 명 한 명이 그대로 학원의 <b className="text-foreground">살아있는
              포트폴리오</b>가 되고, 멀리서도 찾아와 배우는 이유가 됩니다. 잘된 졸업생이 많을수록,
              학원은 <b className="text-foreground">대체 불가능한 기득권</b>이 됩니다.
            </p>
          </div>

          {/* 실증 — 카페의 실제 수강생 후기(살아있는 포트폴리오, 클릭 검증 가능) */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="font-bold break-keep">막연한 약속이 아니라, 실제 후기로 증명합니다.</p>
              <p className="text-sm text-muted-foreground break-keep">
                퀄리오로 시작한 사장님들이 직접 남긴 후기예요. 골라 담은 게 아니라,{' '}
                <b className="text-foreground">카페에서 날짜·댓글까지 그대로</b> 확인하실 수 있습니다.
              </p>
            </div>

            {/* 실제 후기 제목 인용 */}
            <ul className="space-y-2">
              {REVIEWS.map((review) => (
                <li
                  key={review}
                  className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-4 py-3"
                >
                  <Quote className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                  <span className="text-sm font-medium break-keep">{review}</span>
                </li>
              ))}
            </ul>

            <Button asChild variant="outline" className="w-full h-12 text-base font-semibold">
              <a href={CAFE_REVIEWS_URL} target="_blank" rel="noopener noreferrer">
                실제 수강생 후기 전체 보기 →
              </a>
            </Button>
            <p className="text-[11px] text-center text-muted-foreground break-keep">
              실제 수강생 후기이며, 성과는 개인차가 있습니다.
            </p>
          </div>

          {/* 제휴 문의 폼 */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="font-bold break-keep">제휴에 관심 있으세요?</p>
              <p className="text-sm text-muted-foreground break-keep">
                아래에 남겨주시면 담당자가 직접 연락드려, 귀 학원 상황에 맞는{' '}
                <b className="text-foreground">커리큘럼 구성과 제휴 조건</b>을 안내해 드릴게요.
                조건은 학원 규모에 맞춰 협의합니다.
              </p>
            </div>
            <AcademyInquiryForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
