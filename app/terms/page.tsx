import type { Metadata } from 'next'
import { PAID_PLANS, formatPrice } from '@/lib/config/plans'
import { BusinessInfo } from '@/components/business-info'

export const metadata: Metadata = {
  title: '이용약관 | 퀄리오',
  description: '퀄리오 서비스 이용약관',
}

// 퀄리오 이용약관 — 포트원(PortOne) 결제 심사 필수 페이지
export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-2">이용약관</h1>
      <p className="text-sm text-muted-foreground mb-8">시행일: 2026년 4월 15일</p>

      <div className="prose prose-sm max-w-none space-y-8 text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3">제1조 (목적)</h2>
          <p className="text-muted-foreground leading-relaxed">
            본 약관은 퀄리오(이하 "회사")가 제공하는 청소업체 관리 SaaS 서비스(이하 "서비스")의
            이용 조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제2조 (용어의 정의)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>"서비스"란 회사가 제공하는 퀄리오 플랫폼 및 관련 부가 서비스를 의미합니다.</li>
            <li>"이용자"란 본 약관에 동의하고 서비스를 이용하는 사업자(청소업체 운영자)를 의미합니다.</li>
            <li>"고객"이란 이용자의 서비스를 통해 견적을 요청하거나 예약을 진행하는 최종 소비자를 의미합니다.</li>
            <li>"구독"이란 이용자가 서비스를 이용하기 위해 등록한 결제 수단으로 매월 자동 결제(정기결제)하는 월정액 요금제를 의미합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제3조 (약관의 게시 및 개정)</h2>
          <p className="text-muted-foreground leading-relaxed">
            회사는 본 약관의 내용을 서비스 화면에 게시합니다. 회사는 관련 법령을 위배하지 않는 범위 내에서
            본 약관을 개정할 수 있으며, 개정 시 적용일자 및 개정 사유를 명시하여 현행 약관과 함께
            서비스 내 공지합니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제4조 (서비스의 제공)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>온라인 견적 폼 생성 및 관리</li>
            <li>예약 접수 및 관리 대시보드</li>
            <li>3단계 가격 견적 자동화</li>
            <li>카카오 알림톡 예약 확정 발송</li>
            <li>업체 운영 통계 및 리포트</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제5조 (구독 요금 및 정기결제)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            서비스는 아래와 같은 월 구독 플랜을 제공합니다. 구독료는 이용자가 등록한 결제 수단(카드)으로
            매월 결제일에 자동으로 결제(정기결제)되며, 이용자가 해지하기 전까지 매월 동일한 주기로 갱신됩니다.
            이용자는 서비스 내 설정에서 언제든지 구독을 해지할 수 있으며, 해지 시 다음 결제일부터
            자동 결제가 중단됩니다. 결제는 결제대행사 포트원(코리아포트원)을 통해 처리됩니다.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">플랜</th>
                  <th className="text-left px-4 py-2 font-medium">금액</th>
                  <th className="text-left px-4 py-2 font-medium">대상</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {PAID_PLANS.map((plan) => (
                  <tr key={plan.id}>
                    <td className="px-4 py-2">{plan.name}</td>
                    <td className="px-4 py-2">{formatPrice(plan.price)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{plan.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제6조 (청약철회 및 환불 정책)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><b>정기결제 해지</b>: 이용자는 서비스 내 설정에서 언제든지 구독을 해지할 수 있으며, 해지 시 다음 결제 주기부터 요금이 청구되지 않습니다. 이미 결제된 당월 이용 기간은 만료일까지 이용할 수 있습니다. 해지에 따른 위약금은 없습니다.</li>
            <li><b>청약철회</b>: 구독 결제 후 7일 이내 서비스를 이용하지 않은 경우, 청약을 철회하고 전액 환불받을 수 있습니다.</li>
            <li><b>환불 사유</b>: 서비스 장애, 7일 이내 미사용(단순 변심), 중복·오결제 등의 경우 환불이 가능합니다. 구독 기간 중 이용 내역이 있으면 남은 기간에 대해 일할 계산하여 환불합니다.</li>
            <li><b>신청 방법</b>: 고객센터(전화 010-2912-2881, 이메일 ryusc0628@naver.com) 또는 서비스 내 문의를 통해 접수합니다.</li>
            <li><b>처리 절차</b>: 환불 신청 접수 → 이용 내역 확인 → 환불 금액 산정(일할 계산) → 결제 수단으로 환불 처리.</li>
            <li><b>소요 기간</b>: 환불 승인 후 결제 수단 기준 영업일 3~5일 이내에 처리됩니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제7조 (이용자의 의무)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>이용자는 관계 법령, 본 약관의 규정, 회사의 이용 안내를 준수하여야 합니다.</li>
            <li>이용자는 서비스를 통해 수집한 고객의 개인정보를 관련 법령에 따라 적법하게 처리하여야 합니다.</li>
            <li>이용자는 서비스를 이용하여 제3자에게 손해를 입히는 행위를 하여서는 안 됩니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제8조 (서비스 중단 및 책임 제한)</h2>
          <p className="text-muted-foreground leading-relaxed">
            회사는 천재지변, 시스템 점검 등 불가피한 사유로 서비스가 일시 중단될 수 있습니다.
            회사는 서비스 이용과 관련하여 이용자에게 발생한 손해에 대해 고의 또는 중과실이 없는 한
            책임을 지지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제9조 (준거법 및 재판 관할)</h2>
          <p className="text-muted-foreground leading-relaxed">
            본 약관은 대한민국 법령에 따라 해석되며, 분쟁 발생 시 서울중앙지방법원을 전속 관할법원으로 합니다.
          </p>
        </section>

        <section className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-3">사업자 정보</h2>
          <BusinessInfo />
        </section>

      </div>
    </div>
  )
}
