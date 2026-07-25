import Link from 'next/link'
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

export default async function GrowthPage() {
  const stats = await getSocialAnalytics()
  const totalFollowers = stats?.reduce((s, c) => s + (c.followers ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">그로스 콘솔 · 채널 성과</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          청소업의 모든 것 — 5채널 실시간 성과 (Ayrshare API · 크롤링 없음)
        </p>
      </div>

      {stats === null ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            성과를 불러오지 못했어요. <span className="text-foreground">AYRSHARE_API_KEY</span>가 설정돼 있는지,
            Ayrshare Premium이 활성인지 확인해주세요.
          </CardContent>
        </Card>
      ) : (
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
      )}

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
