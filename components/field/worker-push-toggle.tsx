'use client'

import { useEffect, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Bell, BellOff, Smartphone, Share, MoreHorizontal } from 'lucide-react'
import {
  saveWorkerPushSubscriptionAction,
  deleteWorkerPushSubscriptionAction,
  sendWorkerTestPushAction,
} from '@/lib/actions/field-push'

// VAPID 공개키(base64url) → 구독에 필요한 Uint8Array 변환
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// 직원·도급사용 앱 알림 켜기 — 내일 갈 현장, 새 배정, 클레임 처리 요청을 폰으로 받게 한다.
//
// 한 화면에 두 자리로 나눠 붙인다. 알림이 꺼져 있으면 화면 맨 위(slot="onboarding")에서
// 켜라고 권하고, 켜져 있으면 맨 아래(slot="manage")에서 조용히 테스트·끄기만 제공한다.
// 늘 한쪽만 그려지므로 카드가 두 개로 보이는 일은 없다.
//
// ⚠️ 예전엔 이 카드가 맨 아래에만 있었다. 직원은 오늘 일정만 보고 화면을 닫아서 아무도
// 알림을 켜지 않았고(2026-08-22 기준 활성 직원 10명 중 0명), 매일 도는 전날 알림 크론이
// 받는 사람 없이 헛돌았다. 켜라는 안내는 반드시 일정보다 위에 있어야 한다.
type Slot = 'onboarding' | 'manage'

export function WorkerPushToggle({ workerId, slot }: { workerId: string; slot: Slot }) {
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [busy, setBusy] = useState(false)
  // 구독 상태를 확인하기 전에는 아무것도 그리지 않는다 — 이미 켠 직원에게 "알림 켜기"가
  // 잠깐 번쩍이는 것을 막는다.
  const [checked, setChecked] = useState(false)

  const { execute: saveSub } = useAction(saveWorkerPushSubscriptionAction)
  const { execute: deleteSub } = useAction(deleteWorkerPushSubscriptionAction)
  const { execute: sendTest, isPending: testing } = useAction(sendWorkerTestPushAction, {
    onSuccess: () => toast.success('테스트 알림을 보냈어요! 폰을 확인해보세요'),
    onError: () => toast.error('테스트 알림 발송에 실패했어요'),
  })

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true)
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscription(sub))
        .catch((e) => console.error('[Push] 서비스워커 등록 실패:', e))
        .finally(() => setChecked(true))
    } else {
      setChecked(true)
    }
  }, [])

  async function handleEnable() {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('알림이 차단돼 있어요. 브라우저 설정에서 알림을 허용해주세요')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ) as BufferSource,
      })
      setSubscription(sub)

      const json = sub.toJSON()
      saveSub({
        workerId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      })
      toast.success('알림을 켰어요! 내일 갈 현장을 전날 알려드릴게요')
    } catch (e) {
      console.error('[Push] 구독 실패:', e)
      toast.error('알림 설정에 실패했어요. 다시 시도해주세요')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      const endpoint = subscription?.endpoint
      await subscription?.unsubscribe()
      setSubscription(null)
      if (endpoint) deleteSub({ workerId, endpoint })
      toast.success('알림을 껐어요')
    } catch (e) {
      console.error('[Push] 구독 해지 실패:', e)
      toast.error('알림 끄기에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  const enabled = subscription !== null

  // 확인 전에는 그리지 않는다 (깜빡임 방지)
  if (!checked) return null

  // 켜져 있으면 위쪽 안내는 사라지고, 꺼져 있으면 아래쪽 관리 카드는 사라진다 — 늘 하나만 보인다.
  if (slot === 'onboarding' && enabled) return null
  if (slot === 'manage' && !enabled) return null

  // 아이폰 + 아직 홈 화면에 설치 안 한 경우 → 설치 안내 (설치해야만 푸시 가능).
  // 이건 "아직 못 켠 상태"이므로 위쪽 안내 자리에서만 보여준다.
  if (isIOS && !isStandalone) {
    if (slot !== 'onboarding') return null
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">내일 갈 현장, 전날 알려드릴게요</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          아이폰은 <b>홈 화면에 추가</b>하면 내일 어디 몇 시에 가는지 전날 폰으로 받을 수 있어요.
        </p>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-foreground/90">
          <li>오른쪽 아래 <MoreHorizontal className="inline h-4 w-4 mb-0.5" /> <b>· · ·</b>(점 3개)를 눌러요 <span className="text-muted-foreground">(<Share className="inline h-3.5 w-3.5 mb-0.5" /> 공유가 바로 보이면 그걸 눌러요)</span></li>
          <li><Share className="inline h-4 w-4 mb-0.5" /> <b>공유</b> → 목록을 <b>아래로 쭉 내려</b> <b>&quot;홈 화면에 추가&quot;</b>를 눌러요</li>
          <li>오른쪽 위 <b>추가</b>를 누르면 홈 화면에 <b>퀄리오 현장</b> 아이콘이 생겨요</li>
          <li>그 아이콘으로 들어와 <b>&quot;알림 켜기&quot;</b>를 누르면 끝!</li>
        </ol>
      </div>
    )
  }

  // 지원하지 않는 브라우저 — 켤 방법이 없으니 아래쪽에서 이유만 조용히 알린다.
  if (!isSupported) {
    if (slot !== 'manage') return null
    return (
      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          이 브라우저는 앱 알림을 지원하지 않아요. 크롬 또는 사파리(아이폰은 홈 화면 추가 후)에서 이용해주세요.
        </p>
      </div>
    )
  }

  // 아직 안 켠 직원 — 일정보다 위에서 눈에 띄게 권한다
  if (slot === 'onboarding') {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BellOff className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">내일 갈 현장, 전날 알려드릴게요</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          한 번만 켜두면 내일 어디 몇 시에 가는지 전날 폰으로 알려드려요. 일요일엔 이번 주 일정도 한 번에 알려드려요.
        </p>
        <Button type="button" className="h-12 w-full" disabled={busy} onClick={handleEnable}>
          {busy ? '설정 중...' : '알림 켜기'}
        </Button>
      </div>
    )
  }

  // 이미 켠 직원 — 화면 맨 아래에서 확인·끄기만
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">폰으로 알림 받기</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        알림이 켜져 있어요. 내일 갈 현장과 처리할 일(클레임 등)을 이 기기로 알려드려요.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1"
          disabled={testing}
          onClick={() => sendTest({ workerId })}
        >
          {testing ? '보내는 중...' : '테스트 알림 보내기'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 text-destructive"
          disabled={busy}
          onClick={handleDisable}
        >
          알림 끄기
        </Button>
      </div>
    </div>
  )
}
