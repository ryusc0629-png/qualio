import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MODULES, type ModuleId } from '@/lib/config/modules'
import { minPlanForModule } from '@/lib/config/module-access'
import { PLANS } from '@/lib/config/plans'

// 모듈을 안 켠 업체가 그 화면에 들어왔을 때 보여주는 안내.
//
// ★"권한이 없습니다"로 끝내지 말 것 — 사장님은 무엇을 하면 되는지를 알아야 한다.
//   무슨 기능인지 · 왜 잠겼는지 · 어디를 누르면 되는지 세 가지가 한 화면에 있어야 한다.
// ⛔빈 화면이나 404로 돌려보내지 말 것. "내가 뭘 잘못했나" 싶어 CS 전화가 온다.

export function ModuleLocked({
  moduleId,
  /** 이 화면에서 못 하게 된 일 — 기능 이름 말고 사장님이 하려던 행동으로 적는다 */
  what,
}: {
  moduleId: ModuleId
  what: string
}) {
  const mod = MODULES[moduleId]
  const minPlan = minPlanForModule(moduleId)
  const planLabel = minPlan ? PLANS[minPlan].label : null

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>

      <h1 className="text-xl font-bold">{what}은(는) {mod.label}에 있어요</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mod.who}가 쓰는 기능이에요.
        {planLabel && ` 지금 요금제에는 없고 ${planLabel} 플랜부터 쓸 수 있어요.`}
      </p>

      <div className="mt-6 rounded-xl border bg-background p-5 text-left">
        <p className="text-xs font-semibold text-muted-foreground">{mod.label}에 들어 있는 것</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          {LOCKED_FEATURES[moduleId].map((f) => (
            <li key={f} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/50" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild className="h-12">
          <Link href="/upgrade">요금제 보기</Link>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link href="/dashboard">홈으로</Link>
        </Button>
      </div>
    </div>
  )
}

// 화면마다 다시 적지 않도록 여기 모아 둔다 — 요금제 페이지와 같은 말을 써야 한다
const LOCKED_FEATURES: Record<ModuleId, string[]> = {
  field: [
    '현장 직원 앱 — 기사 폰으로 오늘 갈 곳이 떠요',
    '작업 보고서 자동 정리 · 고객 발송',
    'GPS 근태 · 급여 · 명세서',
    '문단속 사진 인증 · 작업 항목 확인',
    '도급사 정산 · 표준 도급 계약서',
  ],
  marketing: [
    '홈페이지 글 자동 발행 월 24편',
    '네이버 · 당근 · 인스타 원고 각 24편',
    '홍보 영상 매달 5편',
    'AI 검색 노출 측정 주 1회',
    '내 도메인으로 홈페이지 열기',
  ],
  client: [
    '거래처 견적서 — 여러 안을 링크로 보내요',
    '시방서 · 용역 계약서 — 법인이 달라는 서류',
    '정기계약 관리 · 방문 자동 생성',
    '초도 리포트 · 월간 리포트 — 재계약 때 쓰는 근거',
    '미팅 녹음 정리',
  ],
}
