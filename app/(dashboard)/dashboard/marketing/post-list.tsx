'use client'

import { useState, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { generatePostAction, deletePostAction, getTopicSuggestionsAction, setMonthlyTargetAction } from '@/lib/actions/posts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, Plus, ExternalLink, Trash2, Eye, EyeOff, Loader2, ImagePlus, X, TrendingUp, RefreshCw, Zap, CalendarDays, CheckCircle2, Clock } from 'lucide-react'
import { PostEditor } from './post-editor'
import { toast } from 'sonner'
import { useRef } from 'react'

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

// 이번 달 자동 발행 예정일 계산 (하루 2회 크론 기준)
interface ScheduleSlot {
  day: number
  date: Date
  post: Post | null       // 이미 발행된 포스트
  topicLabel: string      // 예정 주제 (suggestions에서 순환)
  status: 'published' | 'today' | 'upcoming' | 'past-empty'
}

function buildSchedule(
  target: number,
  posts: Post[],
  suggestions: TopicSuggestion[] | null
): ScheduleSlot[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const RUNS_PER_DAY = 2  // 크론 하루 2회

  // 이번 달 발행된 포스트 (날짜 → 포스트 배열)
  const postsByDay = new Map<number, Post[]>()
  posts.forEach((p) => {
    const d = new Date(p.published_at)
    if (p.published && d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate()
      if (!postsByDay.has(day)) postsByDay.set(day, [])
      postsByDay.get(day)!.push(p)
    }
  })

  // 알고리즘으로 발행 예정 슬롯 계산
  const slots: { day: number; runIndex: number }[] = []
  let simCount = 0

  for (let day = 1; day <= daysInMonth; day++) {
    for (let run = 0; run < RUNS_PER_DAY; run++) {
      if (simCount >= target) break
      const monthProgress = day / daysInMonth
      const postProgress = simCount / target
      if (monthProgress >= postProgress) {
        slots.push({ day, runIndex: run })
        simCount++
      }
    }
    if (simCount >= target) break
  }

  // 각 슬롯에 발행된 포스트 또는 예정 주제 매핑
  const suggestionTitles = suggestions?.map((s) => s.title) ?? []
  let suggIndex = 0

  return slots.map(({ day }) => {
    const date = new Date(year, month, day)
    const dayPosts = postsByDay.get(day) ?? []
    const post = dayPosts.shift() ?? null  // 같은 날 여러 건이면 순서대로 소비

    let status: ScheduleSlot['status']
    if (post) status = 'published'
    else if (day === today) status = 'today'
    else if (day < today) status = 'past-empty'
    else status = 'upcoming'

    const topicLabel = post
      ? post.title
      : suggestionTitles[suggIndex++ % (suggestionTitles.length || 1)] ?? 'AI가 주제를 선택해요'

    return { day, date, post, topicLabel, status }
  })
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

export function PostList({ posts: initialPosts, businessSlug, businessId, monthlyTarget: initialTarget, autoPostLimit, planId }: PostListProps) {
  const [posts] = useState(initialPosts)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [topic, setTopic] = useState('')
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(null)

  // 이번 달 발행 건수
  const now = new Date()
  const postsThisMonth = posts.filter((p) => {
    const d = new Date(p.published_at)
    return p.published && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const progressPct = autoPostLimit > 0 ? Math.min((postsThisMonth / autoPostLimit) * 100, 100) : 0
  const currentMonth = now.getMonth() + 1

  // 월간 일정표
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
    if (cached) {
      setSuggestions(cached.suggestions)
    } else {
      fetchSuggestions({})
    }
    if (initialTarget !== autoPostLimit) {
      saveTarget({ target: autoPostLimit })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefreshSuggestions = () => {
    try { localStorage.removeItem('qualio_topic_cache') } catch { /* 무시 */ }
    setSuggestions(null)
    fetchSuggestions({})
  }

  const { execute: generatePost, isPending: isGenerating } = useAction(generatePostAction, {
    onSuccess: ({ data }) => {
      if (data?.postContent) {
        toast.success('포스트가 생성됐습니다!')
        setShowGenerator(false)
        setTopic('')
        setUploadedUrls([])
        window.location.reload()
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '포스트 생성에 실패했어요. 다시 눌러주세요')
    },
  })

  const { execute: deletePost, isPending: isDeleting } = useAction(deletePostAction, {
    onSuccess: () => {
      toast.success('삭제됐습니다')
      window.location.reload()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '삭제에 실패했습니다')
    },
  })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploadingCount(files.length)
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload-image', { method: 'POST', body: formData })
        const json = await res.json() as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error ?? '업로드 실패')
        return json.url
      })
    )
    const succeeded: string[] = []
    let failCount = 0
    results.forEach((r) => {
      if (r.status === 'fulfilled') succeeded.push(r.value)
      else failCount++
    })
    setUploadedUrls((prev) => [...prev, ...succeeded])
    setUploadingCount(0)
    if (succeeded.length > 0) toast.success(`사진 ${succeeded.length}장이 올라갔어요!`)
    if (failCount > 0) toast.error(`${failCount}장은 업로드에 실패했어요. 다시 시도해주세요`)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (url: string) => setUploadedUrls((prev) => prev.filter((u) => u !== url))

  const handleGenerate = () => {
    generatePost({ topic: topic.trim() || undefined, imageUrl: uploadedUrls[0] })
  }

  const postUrl = (slug: string) =>
    businessSlug ? `${appUrl}/biz/${businessSlug}/posts/${slug}` : null

  const isUploading = uploadingCount > 0

  return (
    <div className="space-y-4">

      {/* ── 자동 발행 현황 ── */}
      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-primary" />
          <p className="font-semibold text-sm">자동 발행 현황</p>
          <span className="text-xs text-muted-foreground ml-1">매일 오전 9시 자동 발행 중</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-2xl font-bold">{postsThisMonth}</span>
              <span className="text-muted-foreground text-sm ml-1">/ {autoPostLimit}건</span>
            </div>
            <span className="text-xs text-muted-foreground">{currentMonth}월 자동 발행</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {autoPostLimit - postsThisMonth > 0
              ? `이번 달 ${autoPostLimit - postsThisMonth}건 남았어요`
              : '이번 달 목표를 모두 달성했어요!'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          현재 플랜: <span className="font-medium">{planId}</span> — 월 {autoPostLimit}건 자동 발행
        </p>
      </div>

      {/* ── 월간 발행 일정표 ── */}
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <p className="font-semibold text-sm">{currentMonth}월 자동 발행 일정</p>
          <span className="text-xs text-muted-foreground ml-1">총 {autoPostLimit}건</span>
        </div>

        {schedule.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">자동 발행이 설정되면 일정이 여기에 표시돼요.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {schedule.map((slot, i) => {
              const dayName = DAYS_KO[slot.date.getDay()]
              const dateLabel = `${currentMonth}월 ${slot.day}일 (${dayName})`
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    slot.status === 'published'
                      ? 'bg-emerald-50'
                      : slot.status === 'today'
                        ? 'bg-blue-50 border border-blue-200'
                        : slot.status === 'past-empty'
                          ? 'bg-slate-50 opacity-50'
                          : 'bg-white border border-dashed border-slate-200'
                  }`}
                >
                  {/* 상태 아이콘 */}
                  {slot.status === 'published' && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {slot.status === 'today' && <Clock className="h-4 w-4 text-blue-500 shrink-0 animate-pulse" />}
                  {slot.status === 'upcoming' && <Clock className="h-4 w-4 text-slate-300 shrink-0" />}
                  {slot.status === 'past-empty' && <div className="h-4 w-4 rounded-full border-2 border-slate-200 shrink-0" />}

                  {/* 날짜 */}
                  <span className={`text-xs font-medium w-24 shrink-0 ${slot.status === 'today' ? 'text-blue-600' : 'text-muted-foreground'}`}>
                    {dateLabel}
                  </span>

                  {/* 주제 */}
                  <span className={`text-xs flex-1 truncate ${
                    slot.status === 'published' ? 'font-medium text-foreground'
                    : slot.status === 'today' ? 'text-blue-700'
                    : slot.status === 'past-empty' ? 'text-muted-foreground line-through'
                    : 'text-muted-foreground'
                  }`}>
                    {slot.status === 'past-empty' ? '발행 안 됨' : slot.topicLabel}
                  </span>

                  {/* 발행 링크 */}
                  {slot.post && postUrl(slot.post.slug) && (
                    <a
                      href={postUrl(slot.post.slug)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />발행 완료</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-400" />오늘 발행 예정</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-300" />발행 예정</span>
        </div>
      </div>

      {/* ── 이번 주 포스팅 기획 ── */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-violet-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="font-semibold text-sm">
            이번 주 포스팅 기획 — {currentMonth}월 인기 주제 10개
          </p>
          <button
            onClick={handleRefreshSuggestions}
            disabled={isLoadingSuggestions}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${isLoadingSuggestions ? 'animate-spin' : ''}`} />
            새로 기획하기
          </button>
        </div>

        {isLoadingSuggestions && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI가 이번 달 인기 주제를 분석 중이에요...
          </div>
        )}

        {suggestions && suggestions.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {suggestions.map((s, i) => (
              <div key={s.topic} className="rounded-lg border bg-white p-3.5 space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-muted-foreground mt-0.5 shrink-0 w-4">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-xs leading-snug">{s.title}</p>
                    <p className="text-xs text-primary mt-0.5">{s.reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => { setShowGenerator(!showGenerator); setShowEditor(false) }} className="gap-2">
          <Sparkles className="h-4 w-4" />
          AI로 포스트 생성
        </Button>
        <Button
          variant="outline"
          onClick={() => { setShowEditor(!showEditor); setEditingPost(null); setShowGenerator(false) }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          직접 작성
        </Button>
      </div>

      {/* AI 생성 패널 */}
      {showGenerator && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm">AI 포스트 자동 생성</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                주제 (선택) — 비워두면 AI가 알아서 선택합니다
              </Label>
              <Input
                placeholder="예: 에어컨 청소 주기, 입주청소 준비 방법, 곰팡이 제거 팁..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                사진 (선택) — 여러 장 선택 가능, AI가 첫 번째 사진을 보고 내용 작성
              </Label>
              {uploadedUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {uploadedUrls.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="업로드된 사진" className="h-20 w-20 rounded-lg object-cover border" />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                        disabled={isGenerating}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className={`flex items-center gap-2 w-fit cursor-pointer rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-accent transition-colors ${isUploading || isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                {isUploading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />{uploadingCount}장 올리는 중...</>
                  : <><ImagePlus className="h-4 w-4" />{uploadedUrls.length > 0 ? '사진 더 추가하기' : '사진 올리기'}</>
                }
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={isUploading || isGenerating} />
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={isGenerating || isUploading} className="gap-2">
              {isGenerating
                ? <><Loader2 className="h-4 w-4 animate-spin" />AI가 작성 중이에요...</>
                : <><Sparkles className="h-4 w-4" />생성하기</>
              }
            </Button>
            <Button variant="ghost" onClick={() => setShowGenerator(false)} disabled={isGenerating}>취소</Button>
          </div>
        </div>
      )}

      {/* 직접 작성 패널 */}
      {showEditor && !editingPost && (
        <PostEditor businessId={businessId} onClose={() => setShowEditor(false)} onSaved={() => { setShowEditor(false); window.location.reload() }} />
      )}

      {/* 수정 패널 */}
      {editingPost && (
        <PostEditor businessId={businessId} post={editingPost} onClose={() => setEditingPost(null)} onSaved={() => { setEditingPost(null); window.location.reload() }} />
      )}

      {/* 포스트 목록 */}
      {posts.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          아직 포스트가 없어요. AI로 첫 번째 포스트를 만들어보세요!
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const url = postUrl(post.slug)
            return (
              <div key={post.id} className="rounded-lg border bg-card p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{post.title}</p>
                    {post.ai_generated && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <Sparkles className="h-3 w-3 mr-1" />AI
                      </Badge>
                    )}
                    {!post.published && (
                      <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">비공개</Badge>
                    )}
                  </div>
                  {post.summary && <p className="text-xs text-muted-foreground line-clamp-1">{post.summary}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(post.published_at).toLocaleDateString('ko-KR')}</p>
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
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={isDeleting}
                    onClick={() => { if (confirm('포스트를 삭제할까요?')) deletePost({ id: post.id }) }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {businessSlug && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          랜딩 페이지:{' '}
          <a href={`${appUrl}/biz/${businessSlug}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            {appUrl}/biz/{businessSlug}
          </a>
        </div>
      )}
    </div>
  )
}
