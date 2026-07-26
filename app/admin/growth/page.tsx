import Link from 'next/link'
import { Suspense } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { getSocialAnalytics } from '@/lib/ayrshare'

// 본사 그로스 콘솔 — 채널 성과 대시보드 (관리자 전용, admin/layout에서 requireAdmin)
export const dynamic = 'force-dynamic'

const NOTION_DRAFTS = 'https://app.notion.com/p/3a8a926abb65818d9adbf35a4fca0d4b'
const SOP = 'https://app.notion.com/p/3a6a926abb6581c08678ca135d880359'

const PLATFORM_EMOJI: Record<string, string> = {
  youtube: '▶️', instagram: '📸', tiktok: '🎵', threads: '🧵', facebook: '👥',
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

// 성과 카드 — Ayrshare API 호출이 느리므로 별도 async 컴포넌트로 분리해
// Suspense로 스트리밍한다(페이지 껍데기는 즉시 렌더 → 클릭이 멈춘 것처럼 보이지 않음).
async function ChannelStats() {
  const stats = await getSocialAnalytics()

  if (stats === null) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          성과를 불러오지 못했어요. <span className="text-foreground">AYRSHARE_API_KEY</span>가 설정돼 있는지,
          Ayrshare Premium이 활성인지 확인해주세요.
        </CardContent>
      </Card>
    )
  }

  const totalFollowers = stats.reduce((s, c) => s + (c.followers ?? 0), 0)

  return (
    <>
      {/* 총합 요약 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-baseline gap-3 py-5">
          <span className="text-sm text-muted-foreground">전 채널 합산 팔로워</span>
          <span className="text-3xl font-bold text-primary">{fmt(totalFollowers)}</span>
          <span className="text-sm text-muted-foreground">명</span>
        </CardContent>
      </Card>

      {/* 채널별 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((c) => (
          <Card key={c.platform}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span>{PLATFORM_EMOJI[c.platform]}</span>
                <span>{c.label}</span>
                {c.handle && (
                  <span className="text-xs font-normal text-muted-foreground">@{c.handle}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-2xl font-bold">{c.followers !== null ? fmt(c.followers) : '—'}</div>
                <div className="text-xs text-muted-foreground">{c.followersLabel}</div>
              </div>
              {c.metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2 border-t pt-3">
                  {c.metrics.map((m) => (
                    <div key={m.label}>
                      <div className="text-sm font-semibold">{fmt(m.value)}</div>
                      <div className="text-[11px] text-muted-foreground">{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

// 성과 로딩 중 자리표시 — 실제 카드와 같은 레이아웃의 스켈레톤
function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-5">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 py-5">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">채널 성과를 불러오는 중이에요…</p>
    </div>
  )
}

export default function GrowthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">그로스 콘솔 · 채널 성과</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          청소업의 모든 것 — 5채널 실시간 성과 (Ayrshare API · 크롤링 없음)
        </p>
      </div>

      {/* 느린 외부 API는 스트리밍 — 껍데기·워크플로우 안내는 즉시 표시 */}
      <Suspense fallback={<StatsSkeleton />}>
        <ChannelStats />
      </Suspense>

      {/* 워크플로우 안내 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">배포 워크플로우</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            영상 → 쇼츠 생성·발행은 로컬 명령어로 실행됩니다 (whisper·ffmpeg는 서버에서 못 돌림):
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
            node scripts/distribute.mjs &quot;&lt;영상&gt;&quot; --ep N --vertical --publish --now
          </pre>
          <div className="flex flex-wrap gap-4 pt-1">
            <Link href={NOTION_DRAFTS} target="_blank" className="text-primary hover:underline">
              📝 네이버 초안 (자동 생성) →
            </Link>
            <Link href={SOP} target="_blank" className="text-primary hover:underline">
              📡 배포 매뉴얼(SOP) →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
