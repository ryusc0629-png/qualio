'use client'

import { useEffect } from 'react'

// 여러 모달이 동시에 열려도 안전하도록 잠금 횟수를 센다
let lockCount = 0
let savedHtmlOverflow = ''
let savedBodyOverflow = ''

function applyLock() {
  lockCount += 1
  if (lockCount > 1) return // 이미 잠겨 있으면 중복 적용하지 않음

  const html = document.documentElement
  const body = document.body
  savedHtmlOverflow = html.style.overflow
  savedBodyOverflow = body.style.overflow
  // overflow: hidden 은 스크롤 위치를 유지하므로 화면 점프가 없음
  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
}

function releaseLock() {
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount > 0) return // 다른 모달이 아직 열려 있으면 잠금 유지

  document.documentElement.style.overflow = savedHtmlOverflow
  document.body.style.overflow = savedBodyOverflow
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
