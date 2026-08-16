// 서버 액션 실패를 사람이 읽을 수 있는 한 줄로 바꾼다.
//
// 왜 이렇게 쓰는가:
//   next-safe-action은 실패를 두 갈래로 돌려준다.
//     ① serverError    — 우리가 던진 '[APP] …' 문구 (업체 없음, 서비스 없음 등)
//     ② validationErrors — 입력값이 스키마에 걸린 경우. 이때 serverError는 비어 있다.
//   예전엔 ②를 안 읽어서 "다시 시도해주세요"만 떴고, 고객은 무엇을 고쳐야 하는지 알 수 없었다.
//   실제로 공개 견적폼에서 700평 요청이 상한(300평)에 걸려 조용히 튕겼는데,
//   화면엔 원인이 안 뜨고 사장님은 "폼으로 요청이 안 들어온다"고만 알게 됐다.

type ActionError = {
  serverError?: string
  validationErrors?: unknown
}

/** validationErrors(중첩 객체 또는 배열)에서 첫 번째 사람이 읽을 메시지를 찾는다 */
function findFirstMessage(node: unknown): string | null {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstMessage(item)
      if (found) return found
    }
    return null
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = findFirstMessage(value)
      if (found) return found
    }
  }
  return null
}

/**
 * 액션 실패 메시지 한 줄. 우선순위: 서버가 준 문구 → 입력값 검증 문구 → 호출한 쪽의 기본 문구.
 */
export function actionErrorMessage(error: ActionError | undefined, fallback: string): string {
  if (error?.serverError) return error.serverError
  return findFirstMessage(error?.validationErrors) ?? fallback
}
