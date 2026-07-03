'use client'

import { useEffect, useState } from 'react'
import { X, Share, Plus, Download, Smartphone, MoreHorizontal } from 'lucide-react'

// 사용자가 닫으면 다시 안 띄움 (기기별 localStorage)
const DISMISS_KEY = 'qualio-install-dismissed'

// Chrome/Android의 설치 프롬프트 이벤트 (표준 타입에 아직 없어 직접 선언)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// 홈 화면 추가(앱 설치) 유도 배너
// - Android/Chrome: 네이티브 설치 프롬프트를 띄우는 "설치하기" 버튼
// - iOS Safari: beforeinstallprompt가 없어 공유→홈 화면에 추가 수동 안내
// 이미 설치(standalone)됐거나 한 번 닫았으면 표시하지 않음.
export function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    // 이미 홈 화면에 설치돼 실행 중이면(standalone) 안내 불필요
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    if (ios) {
      // iOS Safari는 설치 프롬프트 API가 없음 → 수동 안내 배너 바로 노출
      setShow(true)
      return
    }

    // Android/Chrome 등 — 브라우저가 "설치 가능"이라고 알릴 때만 배너 노출
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    setShow(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
  }

  if (!show) return null

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">앱처럼 설치하면 더 편해요</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            홈 화면에 추가하면 바로 열 수 있고, 새 견적·일정 알림도 폰으로 받을 수 있어요.
          </p>

          {isIOS ? (
            // iOS — 수동 설치 안내
            <div className="mt-3">
              {showIOSGuide ? (
                <ol className="text-xs space-y-1.5 list-decimal list-inside text-foreground/90">
                  <li>
                    오른쪽 아래 <MoreHorizontal className="inline h-3.5 w-3.5 mb-0.5" /> <b>· · ·</b>(점 3개)를 눌러요{' '}
                    <span className="text-muted-foreground">(<Share className="inline h-3 w-3 mb-0.5" /> 공유 아이콘이 바로 보이면 그걸 눌러요)</span>
                  </li>
                  <li>
                    <Share className="inline h-3.5 w-3.5 mb-0.5" /> <b>공유</b> → 목록을 아래로 내려 <Plus className="inline h-3.5 w-3.5 mb-0.5" /> <b>&quot;홈 화면에 추가&quot;</b>를 눌러요
                  </li>
                  <li>
                    홈 화면에 생긴 <b>퀄리오</b> 아이콘으로 들어오면 끝!
                  </li>
                </ol>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                >
                  <Download className="h-3.5 w-3.5" />
                  설치 방법 보기
                </button>
              )}
            </div>
          ) : (
            // Android/Chrome — 네이티브 설치 프롬프트
            <button
              type="button"
              onClick={handleInstall}
              className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              앱 설치하기
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="닫기"
          className="shrink-0 p-1 -m-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
