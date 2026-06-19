// 퀄리오 서비스 워커 — 앱 푸시 알림 처리
// 대표가 알림을 켜면 이 워커가 백그라운드에서 푸시를 받아 알림을 띄운다.

self.addEventListener('push', function (event) {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: '퀄리오', body: event.data.text() }
  }

  const title = data.title || '퀄리오 알림'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon.svg',
    badge: '/icon.svg',
    vibrate: [100, 50, 100],
    // 알림 클릭 시 열 주소 (없으면 대시보드)
    data: { url: data.url || '/dashboard' },
    // 같은 tag면 알림이 쌓이지 않고 갱신됨
    tag: data.tag || undefined,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'

  // 이미 열린 탭이 있으면 그쪽으로 포커스, 없으면 새로 열기
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
