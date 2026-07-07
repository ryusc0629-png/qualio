import type { Metadata } from 'next'
import { BusinessInfo } from '@/components/business-info'

export const metadata: Metadata = {
  title: '개인정보처리방침 | 퀄리오',
  description: '퀄리오 개인정보처리방침',
}

// 퀄리오 개인정보처리방침 — 토스페이먼츠 심사 필수 페이지
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-2">개인정보처리방침</h1>
      <p className="text-sm text-muted-foreground mb-8">시행일: 2026년 4월 15일</p>

      <div className="prose prose-sm max-w-none space-y-8 text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3">제1조 (개인정보의 처리 목적)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            퀄리오(이하 "회사")는 다음의 목적을 위하여 개인정보를 처리합니다.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>서비스 회원 가입 및 관리 (이용자 식별, 가입 의사 확인)</li>
            <li>서비스 제공 (예약 접수, 견적 발송, 알림톡 발송)</li>
            <li>결제 처리 및 요금 청구</li>
            <li>고객 문의 응대 및 불만 처리</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제2조 (처리하는 개인정보 항목)</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-2">서비스 이용자(업체 사장님)</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>필수: 이메일 주소, 업체명, 대표자 이름, 연락처</li>
                <li>결제 시: 결제 수단 정보 (토스페이먼츠에서 처리, 회사는 저장하지 않음)</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-2">최종 고객 (청소 서비스 이용자)</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>필수: 이름, 연락처, 서비스 주소 (예약 확정 시에만 수집)</li>
                <li>선택: 청소 날짜, 평수, 요청 사항</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제3조 (개인정보의 처리 및 보유 기간)</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>회원 정보: 회원 탈퇴 시까지</li>
            <li>예약 및 거래 기록: 관련 법령에 따라 5년 보관</li>
            <li>고객 상담 기록: 3년 보관</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제4조 (개인정보의 제3자 제공)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
            다만, 다음의 경우는 예외입니다.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            <li>카카오 알림톡 발송을 위해 Solapi에 수신자 전화번호 제공 (발송 목적 한정)</li>
            <li>결제 처리를 위해 토스페이먼츠에 필요 정보 제공</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제5조 (개인정보 처리의 위탁)</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">수탁 업체</th>
                  <th className="text-left px-4 py-2 font-medium">위탁 업무</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-2">Supabase Inc.</td>
                  <td className="px-4 py-2 text-muted-foreground">클라우드 데이터베이스 및 인증 서비스</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Solapi</td>
                  <td className="px-4 py-2 text-muted-foreground">카카오 알림톡 발송</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">토스페이먼츠</td>
                  <td className="px-4 py-2 text-muted-foreground">결제 처리</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제6조 (정보주체의 권리·의무)</h2>
          <p className="text-muted-foreground leading-relaxed">
            이용자는 회사에 대해 언제든지 개인정보 열람, 정정, 삭제, 처리정지 요구 등의 권리를
            행사할 수 있습니다. 위 권리 행사는 ryusc0628@naver.com 로 연락하시기 바랍니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">제7조 (개인정보 보호책임자)</h2>
          <ul className="list-none space-y-1 text-muted-foreground">
            <li>성명: 퀄리오 개인정보보호팀</li>
            <li>이메일: ryusc0628@naver.com</li>
          </ul>
        </section>

        <section className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-3">사업자 정보</h2>
          <BusinessInfo />
        </section>

      </div>
    </div>
  )
}
