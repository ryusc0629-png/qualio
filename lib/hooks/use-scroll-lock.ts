'use client'

import { useEffect } from 'react'

// 여러 모달이 동시에 열려도 안전하도록 잠금 횟수를 센다
let lockCount = 0
// 잠근 요소별 원래 overflow 값을 보관 (해제 시 그대로 복원)
const locked: { el: HTMLElement; overflow: string }[] = []

function lockEl(el: HTMLElement | null) {
  if (!el) return
  locked.push({ el, overflow: el.style.overflow })
  // overflow: hidden 은 스크롤 위치를 유지하므로 화면 점프가 없음
  el.style.overflow = 'hidden'
}

function applyLock() {
  lockCount += 1
  if (lockCount > 1) return // 이미 잠겨 있으면 중복 적용하지 않음

  // 문서 루트(html/body)뿐 아니라 대시보드 본문 <main overflow-auto> 까지 함께 잠근다.
  // body만 잠그면 실제 스크롤 컨테이너인 <main> 이 모달 끝에서 체이닝되어 배경이 밀리기 때문.
  lockEl(document.documentElement)
  lockEl(document.body)
  document.querySelectorAll('main').forEach((m) => lockEl(m as HTMLElement))
}

function releaseLock() {
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount > 0) return // 다른 모달이 아직 열려 있으면 잠금 유지

  // 잠근 순서의 역순으로 원래 값 복원
  while (locked.length) {
    const { el, overflow } = locked.pop()!
    el.style.overflow = overflow
  }
}

/**
 * 모달이 떠 있는 동안 뒷 배경 페이지의 스크롤을 잠근다.
 * 모달이 마운트될 때 잠그고, 언마운트될 때 해제한다.
 */
export function useScrollLock() {
  useEffect(() => {
    applyLock()
    return () => releaseLock()
  }, [])
}

/**
 * 커스텀(div 기반) 모달 오버레이 안에 넣어 두면
 * 모달이 열려 있는 동안 배경 스크롤을 자동으로 잠그는 컴포넌트.
 *
 * @example
 * <div className="fixed inset-0 ...">
 *   <ScrollLock />
 *   ...
 * </div>
 */
export function ScrollLock() {
  useScrollLock()
  return null
}
