'use client'

import { useState, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { deletePostAction, getTopicSuggestionsAction, setMonthlyTargetAction, publishTodayAction } from '@/lib/actions/posts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Plus, ExternalLink, Trash2, Eye, EyeOff, Loader2, Zap, CheckCircle2, Clock, CalendarDays, Play } from 'lucide-react'
import { PostEditor } from './post-editor'
import { toast } from 'sonner'

interface TopicSuggestion {
  title: string
  reason: string
  topic: string
}

interface SuggestionCache {
  weekKey: string
  suggestions: TopicSuggestion[]
}

function getWeekKey(businessId: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const week = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  )
  return `qualio_suggestions_${businessId}_${year}_w${week}`
}

function loadCache(businessId: string): SuggestionCache | null {
  try {
    const raw = localStorage.getItem('qualio_topic_cache')
    if (!raw) return null
    const cache = JSON.parse(raw) as SuggestionCache
    if (cache.weekKey !== getWeekKey(businessId)) return null
    return cache
  } catch {
    return null
  }
}

function saveCache(businessId: string, suggestions: TopicSuggestion[]) {
  try {
    localStorage.setItem('qualio_topic_cache', JSON.stringify({ weekKey: getWeekKey(businessId), suggestions }))
  } catch { /* 무시 */ }
}

interface Post {
  id: string
  slug: string
  title: string
  summary: string | null
  published: boolean
  ai_generated: boolean
  published_at: string
}

interface PostListProps {
  posts: Post[]
  businessSlug: string | null
  businessId: string
  monthlyTarget: number
  autoPostLimit: number
  planId: string
}

interface ScheduleSlot {
  day: number
  date: Date
  post: Post | null
  topicLabel: string
  status: 'published' | 'today' | 'upcoming'
}

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

function buildSchedule(target: number, posts: Post[], suggestions: TopicSuggestion[] | null): ScheduleSlot[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const postsByDay = new Map<number, Post[]>()
  posts.forEach((p) => {
    const d = new Date(p.published_at)
    if (p.published && d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate()
      if (!postsByDay.has(day)) postsByDay.set(day, [])
      postsByDay.get(day)!.push(p)
    }
  })

  // 발행 예정일 계산 (균등 분포)
  const scheduledDays: number[] = []
  let simCount = 0
  for (let day = 1; day <= daysInMonth; day++) {
    if (simCount >= target) break
    const needed = Math.floor(target * day / daysInMonth) - simCount
    for (let i = 0; i < needed; i++) {
      scheduledDays.push(day)
      simCount++
    }
  }

  const suggestionTitles = suggestions?.map((s) => s.title) ?? []
  let suggIndex = 0

  return scheduledDays
    .map((day) => {
      const date = new Date(year, month, day)
      const dayPosts = postsByDay.get(day) ?? []
      const post = dayPosts.shift() ?? null

      let status: ScheduleSlot['status']
      if (post) status = 'published'
      else if (day === today) status = 'today'
      else if (day >= today) status = 'upcoming'
      else return null  // 과거 미발행 슬롯은 제외

      const topicLabel = post
        ? post.title
        : suggestionTitles.length > 0
          ? suggestionTitles[suggIndex++ % suggestionTitles.length]
          : 'AI가 최적 주제를 선택해요'

      return { day, date, post, topicLabel, status }
    })
    .filter((s): s is ScheduleSlot => s !== null)
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export function PostList({ posts: initialPosts, businessSlug, businessId, monthlyTarget: initialTarget, autoPostLimit, planId }: PostListProps) {
  const [posts] = useState(initialPosts)
  const [showEditor, setShowEditor] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(null)
  const [publishResult, setPublishResult] = useState<{ published: number; message?: string } | null>(null)

  const now = new Date()
  const postsThisMonth = posts.filter((p) => {
    const d = new Date(p.published_at)
    return p.published && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const progressPct = autoPostLimit > 0 ? Math.min((postsThisMonth / autoPostLimit) * 100, 100) : 0
  const currentMonth = now.getMonth() + 1
  const schedule = buildSchedule(autoPostLimit, posts, suggestions)

  const { execute: fetchSuggestions, isPending: isLoadingSuggestions } = useAction(
    getTopicSuggestionsAction,
    {
      onSuccess: ({ data }) => {
        if (data?.suggestions) {
          setSuggestions(data.suggestions)
          saveCache(businessId, data.suggestions)
        }
      },
    }
  )

  const { execute: saveTarget } = useAction(setMonthlyTargetAction)

  useEffect(() => {
    const cached = loadCache(businessId)
    if (cached) setSuggestions(cached.suggestions)
    else fetchSuggestions({})
    if (initialTarget !== autoPostLimit) saveTarget({ target: autoPostLimit })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

const { execute: deletePost, isPending: isDeleting } = useAction(deletePostAction, {
    onSuccess: () => { toast.success('삭제됐습니다'); window.location.reload() },
    onError: ({ error }) => { toast.error(error.serverError ?? '삭제에 실패했습니다') },
  })

  const { execute: publishToday, isPending: isPublishing } = useAction(publishTodayAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      setPublishResult({ published: data.published, message: data.message })
      if (data.published > 0) {
        toast.success(`포스트 ${data.published}건 발행됐어요!`)
        // 목록 갱신을 위해 1.5초 후 페이지 새로고침
        setTimeout(() => window.location.replace(window.location.pathname), 1500)
      } else {
        toast.success(data.message ?? '오늘 목표를 이미 달성했어요!')
      }
    },
    onError: ({ error }) => { toast.error(error.serverError ?? '발행에 실패했습니다') },
  })

const postUrl = (slug: string) => businessSlug ? `${appUrl}/biz/${businessSlug}/posts/${slug}` : null
  const publishedCount = schedule.filter((s) => s.status === 'published').length
  const upcomingCount = schedule.filter((s) => s.status === 'upcoming' || s.status === 'today').length

  return (
    <div className="space-y-5">

      {/* ── 상단 통계 카드 ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-primary">{postsThisMonth}</p>
          <p className="text-xs text-muted-foreground mt-0.5">이번 달 발행</p>
        </div>
        <div className="rounded-xl border bg-white p-4 text-center">
          <p className="text-2xl font-bold">{upcomingCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">예정된 발행</p>
        </div>
        <div className="rounded-xl border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-slate-400">{autoPostLimit}</p>
          <p className="text-xs text-muted-foreground mt-0.5">월 목표</p>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-primary" />
            매일 오전 9시 자동 발행 중 — <span className="font-medium">{planId}</span> 플랜
          </span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* ── 월간 발행 일정표 ── */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <p className="font-semibold text-sm">{currentMonth}월 자동 발행 일정</p>
          </div>
          {isLoadingSuggestions && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />주제 불러오는 중
            </span>
          )}
        </div>

        {schedule.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            이번 달 남은 발행 일정이 없어요
          </div>
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto">
            {schedule.map((slot, i) => {
              const dayName = DAYS_KO[slot.date.getDay()]
              const url = slot.post ? postUrl(slot.post.slug) : null
              return (
                <div
                  key={i}
                  className={`flex items-center gap-4 px-5 py-3 ${
                    slot.status === 'today' ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  {/* 날짜 */}
                  <div className={`w-14 shrink-0 text-center rounded-lg py-1.5 ${
                    slot.status === 'published' ? 'bg-emerald-100'
                    : slot.status === 'today' ? 'bg-blue-100'
                    : 'bg-slate-100'
                  }`}>
                    <p className={`text-xs font-semibold ${
                      slot.status === 'published' ? 'text-emerald-700'
                      : slot.status === 'today' ? 'text-blue-700'
                      : 'text-slate-500'
                    }`}>{currentMonth}/{slot.day}</p>
                    <p className={`text-xs ${
                      slot.status === 'published' ? 'text-emerald-600'
                      : slot.status === 'today' ? 'text-blue-600'
                      : 'text-slate-400'
                    }`}>{dayName}</p>
                  </div>

                  {/* 주제 */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${
                      slot.status === 'published' ? 'font-medium text-foreground'
                      : slot.status === 'today' ? 'font-medium text-blue-800'
                      : 'text-muted-foreground'
                    }`}>
                      {slot.topicLabel}
                    </p>
                    {slot.status === 'today' && (
                      <p className="text-xs text-blue-500 mt-0.5">오늘 오전 9시 발행 예정</p>
                    )}
                  </div>

                  {/* 상태 */}
                  <div className="shrink-0 flex items-center gap-2">
                    {slot.status === 'published' && (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </a>
                        )}
                      </>
                    )}
                    {slot.status === 'today' && <Clock className="h-4 w-4 text-blue-500 animate-pulse" />}
                    {slot.status === 'upcoming' && <Clock className="h-4 w-4 text-slate-300" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 범례 */}
        <div className="px-5 py-2.5 border-t bg-slate-50 flex items-center gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />발행 완료</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-400" />오늘 예정</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-300" />예정</span>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => { setPublishResult(null); publishToday({}) }}
          disabled={isPublishing || publishResult?.published === 0}
          className="gap-2"
          variant={publishResult !== null && !isPublishing ? 'outline' : 'default'}
        >
          {isPublishing
            ? <><Loader2 className="h-4 w-4 animate-spin" />AI가 작성 중이에요...</>
            : publishResult !== null
              ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" />{publishResult.published > 0 ? `${publishResult.published}건 발행됐어요!` : '오늘 발행 완료!'}</>
              : <><Play className="h-4 w-4" />지금 발행</>
          }
        </Button>
        <Button variant="outline" onClick={() => { setShowEditor(!showEditor); setEditingPost(null) }} className="gap-2">
          <Plus className="h-4 w-4" />직접 작성
        </Button>
      </div>

      {/* 직접 작성 패널 */}
      {showEditor && !editingPost && (
        <PostEditor businessId={businessId} onClose={() => setShowEditor(false)} onSaved={() => { setShowEditor(false); window.location.reload() }} />
      )}

      {/* 수정 패널 */}
      {editingPost && (
        <PostEditor businessId={businessId} post={editingPost} onClose={() => setEditingPost(null)} onSaved={() => { setEditingPost(null); window.location.reload() }} />
      )}

      {/* ── 발행된 포스트 목록 ── */}
      {posts.length > 0 && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-slate-50">
            <p className="font-semibold text-sm">전체 발행 포스트 ({posts.length}건)</p>
          </div>
          <div className="divide-y">
            {posts.map((post) => {
              const url = postUrl(post.slug)
              return (
                <div key={post.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{post.title}</p>
                      {post.ai_generated && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <Sparkles className="h-3 w-3 mr-1" />AI
                        </Badge>
                      )}
                      {!post.published && <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">비공개</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(post.published_at).toLocaleDateString('ko-KR')}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingPost(post)}>
                      {post.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" disabled={isDeleting}
                      onClick={() => { if (confirm('포스트를 삭제할까요?')) deletePost({ id: post.id }) }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {posts.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          아직 포스트가 없어요. AI로 첫 번째 포스트를 만들어보세요!
        </div>
      )}

      {businessSlug && (
        <div className="text-xs text-muted-foreground text-center pt-1">
          랜딩 페이지:{' '}
          <a href={`${appUrl}/biz/${businessSlug}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            {appUrl}/biz/{businessSlug}
          </a>
        </div>
      )}
    </div>
  )
}
