import type { Metadata } from 'next'
import { GraduationCap, ArrowRight, TrendingUp, LineChart, Repeat } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { AcademyInquiryForm } from './academy-inquiry-form'

// 검색 노출을 원하므로 noindex 미적용 — 학원이 검색으로도 찾아올 수 있게 SEO 메타 강화
export const metadata: Metadata = {
  title: '기술 창업 학원 제휴 — 수료생 정착 시스템 임베드 | 퀄리오',
  description:
    '기술은 가르쳐도 졸업 후 영업·마케팅·운영은 아무도 안 가르칩니다. 검증된 청소 창업 운영 교육(OPS)과 자동화 도구를 귀 학원 커리큘럼에 심어, 수료생 정착률과 재등록·모집 선순환을 만듭니다. 제휴 문의를 남겨주세요.',
  keywords: [
    '기술 창업 학원 제휴',
    '청소 창업 교육',
    '직업전문학교 제휴',
    '수료생 취업 창업 지원',
    '청소업 운영 교육',
    '퀄리오 제휴',
  ],
  openGraph: {
    title: '기술 창업 학원 제휴 — 수료생이 졸업 후에도 자리 잡게',
    description:
      '검증된 청소 창업 운영 교육과 자동화 도구를 학원 커리큘럼에 심어 수료생 정착률을 높입니다.',
    type: 'website',
  },
}

// 학원이 겪는 문제 — '데이터로 증명되는 빈칸'
const GAPS = [
  {
    stat: '기술 교육',
    label: '학원이 채우는 것',
    desc: '청소·방역·시공 등 손기술은 완성도 높게 가르칩니다.',
  },
  {
    stat: '운영 교육',
    label: '아무도 안 채우는 것',
    desc: '견적·영업·마케팅·고객관리 — 졸업 후 매출을 만드는 진짜 기술은 공백입니다.',
  },
  {
    stat: '수료생 폐업',
    label: '그 결과',
    desc: '오더를 못 따 남 밑으로 가거나 문을 닫습니다. 이게 학원 후기·재등록·모집을 갉아먹습니다.',
  },
]

// 학원 커리큘럼에 심어드리는 것 — 결과 중심(상세 목차·조건은 미팅에서)
const IMPLANT = [
  {
    icon: LineChart,
    title: 'OPS 운영 교육 임베드',
    desc: '견적 짜는 법부터 영업·마케팅·고객관리까지, 실제 현장에서 검증된 운영 커리큘럼을 귀 학원 수업에 그대로 붙여드립니다.',
  },
  {
    icon: TrendingUp,
    title: '수료생용 자동화 도구 제공',
    desc: '견적→예약→결제→알림톡→후기까지 운영 전 과정을 자동화하는 도구를 수료생이 창업과 동시에 쓰게 합니다.',
  },
  {
    icon: Repeat,
    title: '정착 → 모집 선순환',
    desc: '수료생이 졸업 후 실제로 자리 잡으면, 그 성과가 후기·재등록·신규 모집으로 돌아옵니다.',
  },
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

          {/* 헤드라인 — 진짜 통증: 기술은 가르쳐도 운영은 못 가르친다 */}
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight break-keep">
            기술은 가르치는데,
            <br />
            졸업 후 <span className="text-primary">운영</span>은
            <br />
            왜 아무도 안 가르칠까요?
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed break-keep">
            수료생이 손기술은 배웠는데 <b className="text-foreground">견적·영업·마케팅</b>을 몰라
            오더를 못 땁니다. 결국 남 밑으로 가거나 문을 닫죠. 그리고 그 폐업률이 학원 후기와
            다음 기수 모집의 발목을 잡습니다.
          </p>

          {/* 데이터로 보는 빈칸 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GAPS.map(({ stat, label, desc }) => (
              <div key={stat} className="rounded-xl border bg-muted/40 p-4 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                <p className="text-lg font-bold text-foreground break-keep">{stat}</p>
                <p className="text-xs text-muted-foreground break-keep">{desc}</p>
              </div>
            ))}
          </div>

          <p className="text-base leading-relaxed break-keep font-medium">
            퀄리오는 그 빈칸을 채웁니다. 검증된{' '}
            <b className="text-primary">운영 교육과 자동화 도구</b>를 귀 학원 커리큘럼에
            심어드려요.
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
                졸업 후 운영은 퀄리오가 책임집니다.
              </span>
            </div>
          </div>

          {/* 증거 프레임 — 데이터는 있으나 구체 수치·조건은 미팅에서 공개(전략적 숨김) */}
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 space-y-2">
            <p className="font-bold break-keep">막연한 약속이 아니라, 데이터로 증명합니다.</p>
            <p className="text-sm text-muted-foreground break-keep">
              퀄리오는 수료생 한 명 한 명의 견적·예약·<b className="text-foreground">매출을 데이터로
              추적</b>합니다. 제휴 학원에는 수료생들의 실제 성장 데이터를 리포트로 제공하고요.{' '}
              <b className="text-foreground">실제 매출 상승 케이스</b>는 미팅에서 숫자 그대로
              보여드립니다.
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
