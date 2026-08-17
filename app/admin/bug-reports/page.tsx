import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/format/datetime'
import { BugReportRowActions } from './bug-report-row'

// 항상 최신 신고를 보여준다(캐시 금지)
export const dynamic = 'force-dynamic'

type BugReport = {
  id: string
  business_id: string | null
  reporter_name: string | null
  message: string
  page_url: string | null
  user_agent: string | null
  viewport: string | null
  app_version: string | null
  media_urls: string[] | null
  status: string
  admin_note: string | null
  resolved_at: string | null
  created_at: string
}

// 확장자로 영상 여부 판단 (첨부 렌더링용)
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|avi|ogg)(\?|$)/i.test(url)
}

// 기기 정보를 사람이 읽는 한 줄로 — 원문 UA는 길고 알아보기 어렵다
function describeDevice(ua: string | null): string {
  if (!ua) return '기기 정보 없음'
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iPhone·iPad'
    : /Android/i.test(ua)
      ? '안드로이드'
      : /Macintosh|Mac OS X/i.test(ua)
        ? '맥'
        : /Windows/i.test(ua)
          ? '윈도우'
          : '기타'
  const browser = /CriOS|Chrome/i.test(ua)
    ? '크롬'
    : /FxiOS|Firefox/i.test(ua)
      ? '파이어폭스'
      : /Safari/i.test(ua)
        ? '사파리'
        : /KAKAOTALK/i.test(ua)
          ? '카카오톡 브라우저'
          : '기타 브라우저'
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua)
  return `${os} · ${browser} · ${isMobile ? '폰·태블릿' : 'PC'}`
}

// 처리 상태 라벨/색상
const STATUS_META: Record<string, { label: string; className: string }> = {
  new: { label: '신규', className: 'bg-red-100 text-red-700' },
  reviewing: { label: '확인 중', className: 'bg-amber-100 text-amber-700' },
  resolved: { label: '해결됨', className: 'bg-slate-100 text-slate-500' },
}

export default async function BugReportsPage() {
  // bug_reports는 아직 database.ts 타입에 없어 loose 클라이언트로 접근
  const looseDb = createServiceClient() as unknown as SupabaseClient
  const { data } = (await looseDb
    .from('bug_reports')
    .select('id, business_id, reporter_name, message, page_url, user_agent, viewport, app_version, media_urls, status, admin_note, resolved_at, created_at')
    .order('created_at', { ascending: false })) as unknown as { data: BugReport[] | null }

  const rows = data ?? []
  const total = rows.length
  const newCount = rows.filter((r) => r.status === 'new').length
  const resolvedCount = rows.filter((r) => r.status === 'resolved').length

  // 처리할 것을 위로, 끝난 것은 아래로 접어 내린다 — 매일 볼 때 남은 일만 보이게
  const open = rows.filter((r) => r.status !== 'resolved')
  const resolved = rows.filter((r) => r.status === 'resolved')

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">오류 신고</h1>
        <span className="text-xs text-muted-foreground">베타 사용자 신고 모음</span>
      </div>

      {/* 요약 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-red-50/40 border-red-200 p-4">
          <p className="text-xs text-muted-foreground">전체 신고</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{total}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">신규(미확인)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{newCount}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">해결됨</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{resolvedCount}</p>
        </div>
      </div>

      {/* 명단 — 모바일 카드 목록 */}
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-background py-12 text-center">
          <p className="text-3xl">🐞</p>
          <p className="mt-2 text-sm text-muted-foreground">아직 접수된 오류 신고가 없어요</p>
          <p className="mt-1 text-xs text-muted-foreground">
            사장님이 앱에서 &lsquo;오류 신고&rsquo;를 누르면 여기에 쌓입니다
          </p>
        </div>
      ) : (
        <>
          {open.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 py-8 text-center">
              <p className="text-sm font-medium text-emerald-800">처리할 신고가 없어요</p>
              <p className="mt-1 text-xs text-emerald-700">들어온 신고를 전부 닫았습니다</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {open.map((r) => (
                <ReportCard key={r.id} r={r} />
              ))}
            </ul>
          )}

          {resolved.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                해결한 신고 {resolved.length}건 보기
              </summary>
              <ul className="mt-2 space-y-2">
                {resolved.map((r) => (
                  <ReportCard key={r.id} r={r} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

// 신고 한 건 — 내용·첨부·기기 정보에 처리 버튼까지 한 카드에 담는다
function ReportCard({ r }: { r: BugReport }) {
  const meta = STATUS_META[r.status] ?? STATUS_META.new!
  const isResolved = r.status === 'resolved'

  return (
    <li className={`rounded-lg border bg-background px-4 py-3 ${isResolved ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* 신고자 이름 — 업체가 있으면 그 업체 상세로 바로 넘어간다 */}
          {r.business_id ? (
            <Link
              href={`/admin/businesses/${r.business_id}`}
              className="font-semibold truncate hover:underline"
            >
              {r.reporter_name ?? '(이름 없음)'}
            </Link>
          ) : (
            <span className="font-semibold truncate">{r.reporter_name ?? '(비로그인)'}</span>
          )}
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}>
            {meta.label}
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDateTime(r.created_at, {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">{r.message}</p>

      {/* 첨부 이미지·영상 — 클릭하면 원본 새 탭 */}
      {r.media_urls && r.media_urls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {r.media_urls.map((url) =>
            isVideoUrl(url) ? (
              <video key={url} src={url} controls className="h-32 rounded-lg border bg-black" />
            ) : (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="신고 첨부"
                  className="h-24 w-24 rounded-lg border object-cover transition-opacity hover:opacity-80"
                />
              </a>
            ),
          )}
        </div>
      )}

      {/* 재현에 필요한 상황 — 어느 화면·어떤 기기·어느 배포에서 났는지 */}
      <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
        {r.page_url && (
          <p>
            화면: <span className="font-mono">{r.page_url}</span>
          </p>
        )}
        <p>
          {describeDevice(r.user_agent)}
          {r.viewport ? ` · ${r.viewport}` : ''}
          {r.app_version ? ` · 배포 ${r.app_version}` : ''}
        </p>
        {isResolved && r.resolved_at && (
          <p>
            해결{' '}
            {formatDateTime(r.resolved_at, {
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>

      <BugReportRowActions id={r.id} status={r.status} adminNote={r.admin_note} />
    </li>
  )
}
