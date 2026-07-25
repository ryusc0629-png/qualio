// Ayrshare 채널 성과 조회 (서버 전용) — 본사 그로스 콘솔에서 사용
// AYRSHARE_API_KEY는 .env.local에 있음(Premium 계정 ceo@qualio.co.kr)

const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'threads', 'facebook'] as const
type Platform = (typeof PLATFORMS)[number]

export type ChannelStat = {
  platform: Platform
  label: string
  handle: string | null
  followers: number | null // 구독자/팔로워
  followersLabel: string
  metrics: { label: string; value: number }[]
}

type RawAnalytics = Record<string, unknown>
type RawResponse = Record<string, { analytics?: RawAnalytics } | undefined>

// 채널별 표시 설정 — 팔로워 후보 키 + 보조 지표
const CONFIG: Record<Platform, {
  label: string
  followersKeys: string[]
  followersLabel: string
  handleKey?: string
  metrics: { key: string; label: string }[]
}> = {
  youtube: {
    label: '유튜브', followersKeys: ['subscriberCount'], followersLabel: '구독자', handleKey: 'handle',
    metrics: [
      { key: 'viewCount', label: '총 조회수' },
      { key: 'likes', label: '좋아요' },
      { key: 'comments', label: '댓글' },
      { key: 'estimatedMinutesWatched', label: '시청(분)' },
    ],
  },
  instagram: {
    label: '인스타그램', followersKeys: ['followersCount'], followersLabel: '팔로워', handleKey: 'username',
    metrics: [{ key: 'mediaCount', label: '게시물' }, { key: 'followsCount', label: '팔로잉' }],
  },
  tiktok: {
    label: '틱톡', followersKeys: ['followerCount', 'followersCount'], followersLabel: '팔로워',
    metrics: [{ key: 'videoCount', label: '영상' }, { key: 'likesCount', label: '좋아요' }, { key: 'profileViews', label: '프로필 조회' }],
  },
  threads: {
    label: '스레드', followersKeys: ['followersCount'], followersLabel: '팔로워',
    metrics: [{ key: 'likes', label: '좋아요' }, { key: 'views', label: '조회' }],
  },
  facebook: {
    label: '페이스북', followersKeys: ['followersCount', 'fanCount'], followersLabel: '팔로워',
    metrics: [{ key: 'fanCount', label: '팬' }],
  },
}

function numAt(a: RawAnalytics, key: string): number | null {
  const v = a[key]
  return typeof v === 'number' ? v : null
}
function strAt(a: RawAnalytics, key: string | undefined): string | null {
  if (!key) return null
  const v = a[key]
  return typeof v === 'string' ? v : null
}

export async function getSocialAnalytics(): Promise<ChannelStat[] | null> {
  const key = process.env.AYRSHARE_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.ayrshare.com/api/analytics/social', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ platforms: PLATFORMS }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as RawResponse

    return PLATFORMS.map((p) => {
      const cfg = CONFIG[p]
      const a = data[p]?.analytics ?? {}
      const followers = cfg.followersKeys.map((k) => numAt(a, k)).find((v) => v !== null) ?? null
      const metrics = cfg.metrics
        .map((m) => ({ label: m.label, value: numAt(a, m.key) }))
        .filter((m): m is { label: string; value: number } => m.value !== null)
      return {
        platform: p,
        label: cfg.label,
        handle: strAt(a, cfg.handleKey),
        followers,
        followersLabel: cfg.followersLabel,
        metrics,
      }
    })
  } catch (error) {
    console.error('[Ayrshare] 성과 조회 실패:', error)
    return null
  }
}
