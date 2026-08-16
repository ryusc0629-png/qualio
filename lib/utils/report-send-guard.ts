// 작업 보고서를 고객에게 보낼 수 있는 예약 상태 판정.
//
// 왜 필요한가:
//   작업 보고서는 "다 끝났습니다, 이렇게 했습니다"라는 문서다. 그런데 발송 경로 어디에도
//   예약 상태 검사가 없어서, 아직 청소하지도 않은 내일 일정에 보고서가 작성·발송된 적이 있다
//   (2026-08-17: 8/18 09:00 예정 건에 전날 새벽 00:56 발송). 고객에게 한 번 나가면 되돌릴 수 없다.
//
//   '진행 중'은 허용한다. 현장 기사가 청소를 마치고 보고서를 쓰는 시점에도 수금이 안 끝나면
//   예약은 아직 완료로 안 넘어가기 때문(완료 전환은 수금 처리에서 일어난다).
//   막아야 하는 건 '아직 시작도 안 한 일정'이다.

/** 보고서를 보낼 수 있는 예약 상태 */
export const REPORT_SENDABLE_STATUSES = ['completed', 'in_progress'] as const

export function canSendReport(status: string | null | undefined): boolean {
  return !!status && (REPORT_SENDABLE_STATUSES as readonly string[]).includes(status)
}

/** 보낼 수 없는 상태면 사장님·기사가 읽고 다음 행동을 알 수 있는 문구로 막는다 */
export function assertReportSendable(status: string | null | undefined): void {
  if (canSendReport(status)) return
  if (status === 'cancelled') {
    throw new Error('[APP] 취소된 일정이에요. 보고서를 보낼 수 없어요')
  }
  throw new Error('[APP] 아직 시작하지 않은 일정이에요. 작업을 마친 뒤에 보고서를 보내주세요')
}
