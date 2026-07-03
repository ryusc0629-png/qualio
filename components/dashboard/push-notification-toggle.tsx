'use client'

import { useEffect, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Bell, BellOff, Smartphone, Share, Plus, MoreHorizontal } from 'lucide-react'
import {
  savePushSubscriptionAction,
  deletePushSubscriptionAction,
  sendTestPushAction,
} from '@/lib/actions/push'

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

export function PushNotificationToggle() {
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [busy, setBusy] = useState(false)

  const { execute: saveSub } = useAction(savePushSubscriptionAction)
  const { execute: deleteSub } = useAction(deletePushSubscriptionAction)
  const { execute: sendTest, isPending: testing } = useAction(sendTestPushAction, {
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
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      })
      toast.success('알림을 켰어요! 새 견적·일정이 생기면 폰으로 알려드릴게요')
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
      if (endpoint) deleteSub({ endpoint })
      toast.success('알림을 껐어요')
    } catch (e) {
      console.error('[Push] 구독 해지 실패:', e)
      toast.error('알림 끄기에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  // 아이폰 + 아직 홈 화면에 설치 안 한 경우 → 설치 안내 (설치해야만 푸시 가능)
  if (isIOS && !isStandalone) {
    return (
      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">폰으로 알림 받기</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          아이폰은 <b>홈 화면에 추가</b>하면 새 견적·일정 알림을 폰으로 받을 수 있어요.
        </p>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-foreground/90">
          <li>오른쪽 아래 <MoreHorizontal className="inline h-4 w-4 mb-0.5" /> <b>· · ·</b>(점 3개)를 눌러요 <span className="text-muted-foreground">(<Share className="inline h-3.5 w-3.5 mb-0.5" /> 공유가 바로 보이면 그걸 눌러요)</span></li>
          <li><Share className="inline h-4 w-4 mb-0.5" /> <b>공유</b> → 목록을 아래로 내려 <Plus className="inline h-4 w-4 mb-0.5" /> <b>&quot;홈 화면에 추가&quot;</b>를 눌러요</li>
          <li>홈 화면에 생긴 <b>퀄리오</b> 아이콘으로 다시 들어와요</li>
          <li>여기서 <b>&quot;알림 켜기&quot;</b>를 누르면 끝!</li>
        </ol>
      </div>
    )
  }

  if (!isSupported) {
    return (
      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          이 브라우저는 앱 알림을 지원하지 않아요. 크롬 또는 사파리(아이폰은 홈 화면 추가 후)에서 이용해주세요.
        </p>
      </div>
    )
  }

  const enabled = subscription !== null

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {enabled ? <Bell className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
        <h3 className="font-semibold">폰으로 알림 받기</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {enabled
          ? '알림이 켜져 있어요. 새 견적·일정이 생기면 이 기기로 바로 알려드려요.'
          : '켜두면 새 견적·일정이 들어올 때 폰(또는 이 기기)으로 바로 알림이 와요.'}
      </p>

      {enabled ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={testing}
            onClick={() => sendTest({})}
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
      ) : (
        <Button type="button" className="h-12 w-full" disabled={busy} onClick={handleEnable}>
          {busy ? '설정 중...' : '알림 켜기'}
        </Button>
      )}
    </div>
  )
}
