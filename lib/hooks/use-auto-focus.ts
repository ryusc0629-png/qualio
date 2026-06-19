import { useCallback } from 'react'

/**
 * 모달이 열릴 때 컨테이너에 포커스를 "한 번만" 잡아주는 ref 콜백.
 *
 * 왜 필요한가: `ref={(el) => el?.focus()}` 처럼 인라인 화살표 함수를 쓰면
 * 매 렌더마다 새 함수가 만들어져 React가 detach→attach를 반복 → 매 렌더마다
 * focus()가 호출된다. 그 결과 입력 중인 칸의 포커스를 모달이 빼앗아
 * "한 글자 입력 후 포커스 빠짐 / 버튼 두 번 클릭" 버그가 생긴다.
 *
 * useCallback으로 함수를 고정하면 마운트(=모달 열림) 시 한 번만 focus()가 실행된다.
 * 조건부 렌더(`{open && ...}` 또는 `if(!open) return`)되는 오버레이 안에서 사용할 것.
 */
export function useAutoFocusRef<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    el?.focus()
  }, [])
}
