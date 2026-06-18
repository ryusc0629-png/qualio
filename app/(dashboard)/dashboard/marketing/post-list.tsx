'use client'

import { useState, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { deletePostAction, getTopicSuggestionsAction, setMonthlyTargetAction, publishTodayAction, generatePostImagesAction, markChannelsPostedAction } from '@/lib/actions/posts'
import { approvePortfolioAction, rejectPortfolioAction } from '@/lib/actions/portfolio'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Plus, ExternalLink, Trash2, Loader2, Zap, CheckCircle2, Clock, CalendarDays, Play, Copy, X, ImageIcon, Download, Camera, Check, XIcon, Pencil, Film, ListChecks, Send } from 'lucide-react'
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
  image_url: string | null
  image_urls: string[] | null
  naver_title: string | null
  naver_content: string | null
  naver_tags: string[] | null
  daangn_content: string | null
  instagram_content: string | null
  instagram_hashtags: string[] | null
  post_type?: string | null
  before_image_urls?: string[] | null
  after_image_urls?: string[] | null
  channel_posted_at?: string | null
}

interface PendingPortfolio {
  id: string
  title: string
  summary: string | null
  before_image_urls: string[]
  after_image_urls: string[]
}

interface DoneReel {
  reportId: string
  reelUrl: string
  bookingId: string
  customerName: string
  scheduledAt: string
}

interface PostListProps {
  posts: Post[]
  businessSlug: string | null
  businessId: string
  monthlyTarget: number
  autoPostLimit: number
  planId: string
  isTodayComplete: boolean
  pendingPortfolios?: PendingPortfolio[]
  doneReels?: DoneReel[]
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

export function PostList({ posts: initialPosts, businessSlug, businessId, monthlyTarget: initialTarget, autoPostLimit, planId, isTodayComplete, pendingPortfolios = [], doneReels = [] }: PostListProps) {
  const [posts] = useState(initialPosts)
  const [showEditor, setShowEditor] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(null)
  // 오늘 이미 발행 완료된 경우 버튼 초기 상태를 완료로 설정
  const [publishResult, setPublishResult] = useState<{ published: number; message?: string } | null>(
    isTodayComplete ? { published: 0, message: '오늘 발행 완료!' } : null
  )
  const [naverPost, setNaverPost] = useState<Post | null>(null)
  const [daangnPost, setDaangnPost] = useState<Post | null>(null)
  const [instaPost, setInstaPost] = useState<Post | null>(null)
  const [galleryPost, setGalleryPost] = useState<Post | null>(null)
  const [genId, setGenId] = useState<string | null>(null)
  const [postingId, setPostingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const handleNaverCopy = (content: string) => handleCopy(content)

  const now = new Date()
  const postsThisMonth = posts.filter((p) => {
    const d = new Date(p.published_at)
    return p.published && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const progressPct = autoPostLimit > 0 ? Math.min((postsThisMonth / autoPostLimit) * 100, 100) : 0
  const currentMonth = now.getMonth() + 1
  const schedule = buildSchedule(autoPostLimit, posts, suggestions)

  // 아직 채널에 안 올린 글 (포트폴리오 제외, 채널 콘텐츠 있고 완료 처리 안 된 것)
  const channelTodos = posts.filter((p) => {
    if (p.post_type === 'portfolio' || !p.published) return false
    if (!(p.naver_content || p.daangn_content || p.instagram_content)) return false
    return !p.channel_posted_at
  })

  // 사장님이 처리해야 할 작업물 총합 (릴스 + 시공 사례 + 새 글)
  const totalTodos = doneReels.length + pendingPortfolios.length + channelTodos.length

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

  const { execute: generateImages } = useAction(generatePostImagesAction, {
    onSuccess: () => {
      toast.success('이미지가 만들어졌어요!')
      setTimeout(() => window.location.replace(window.location.pathname), 1200)
    },
    onError: ({ error }) => { setGenId(null); toast.error(error.serverError ?? '이미지 생성에 실패했어요') },
  })

  const { execute: markChannelsPosted } = useAction(markChannelsPostedAction, {
    onSuccess: () => { toast.success('올림 완료로 표시했어요!'); setTimeout(() => window.location.replace(window.location.pathname), 800) },
    onError: ({ error }) => { setPostingId(null); toast.error(error.serverError ?? '처리에 실패했어요') },
  })

  const { execute: approvePortfolio, isPending: isApproving } = useAction(approvePortfolioAction, {
    onSuccess: () => { toast.success('시공 사례가 공개됐어요!'); setTimeout(() => window.location.replace(window.location.pathname), 1200) },
    onError: ({ error }) => { toast.error(error.serverError ?? '승인에 실패했어요') },
  })

  const { execute: rejectPortfolio, isPending: isRejecting } = useAction(rejectPortfolioAction, {
    onSuccess: () => { toast.success('삭제됐어요'); setTimeout(() => window.location.replace(window.location.pathname), 1200) },
    onError: ({ error }) => { toast.error(error.serverError ?? '삭제에 실패했어요') },
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

  // 채널별 복사 버튼 (네이버/당근/인스타/이미지) — 작업물 허브와 전체 목록에서 공용
  const renderChannelButtons = (post: Post) => (
    <>
      {post.naver_content && (
        <button
          type="button"
          onClick={() => setNaverPost(post)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-white bg-[#03C75A] hover:bg-[#02b050] transition-colors"
          title="네이버 블로그용 글 복사"
        >
          N
        </button>
      )}
      {post.daangn_content && (
        <button
          type="button"
          onClick={() => setDaangnPost(post)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-white bg-[#FF6F0F] hover:bg-[#e5620d] transition-colors"
          title="당근마켓용 글 복사"
        >
          🥕
        </button>
      )}
      {post.instagram_content && (
        <button
          type="button"
          onClick={() => setInstaPost(post)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-white bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] hover:opacity-90 transition-opacity"
          title="인스타그램용 글 복사"
        >
          IG
        </button>
      )}
      {(post.image_urls?.length ?? 0) > 0 ? (
        <button
          type="button"
          onClick={() => setGalleryPost(post)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-violet-700 bg-violet-100 hover:bg-violet-200 transition-colors"
          title="생성된 이미지 보기"
        >
          <ImageIcon className="h-3.5 w-3.5" />{post.image_urls!.length}
        </button>
      ) : (
        <button
          type="button"
          disabled={genId === post.id}
          onClick={() => { setGenId(post.id); generateImages({ id: post.id }) }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-60"
          title="이 글에 맞는 이미지 생성 (게시물당 1회)"
        >
          {genId === post.id
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />생성 중</>
            : <><ImageIcon className="h-3.5 w-3.5" />이미지</>}
        </button>
      )}
    </>
  )

  return (
    <div className="space-y-5">

      {/* ── 올려야 할 작업물 허브 (한눈에 보기) ── */}
      <div className="rounded-2xl border-2 border-primary/15 bg-white overflow-hidden shadow-sm">
        <div className="px-4 sm:px-5 py-3.5 border-b bg-primary/5 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <p className="font-bold text-sm">올려야 할 작업물</p>
          {totalTodos > 0 && (
            <span className="ml-auto inline-flex items-center justify-center h-6 px-2 rounded-full bg-primary text-white text-xs font-bold">
              {totalTodos}
            </span>
          )}
        </div>

        {totalTodos === 0 ? (
          <div className="px-5 py-8 text-center space-y-1.5">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium">올릴 작업물을 다 처리했어요!</p>
            <p className="text-xs text-muted-foreground">새 릴스·시공 사례·포스트가 생기면 여기에 모아둘게요</p>
          </div>
        ) : (
          <div className="divide-y">

            {/* 🎬 완성된 릴스 */}
            {doneReels.length > 0 && (
              <div className="px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Film className="h-4 w-4 text-rose-500" />
                  <p className="text-sm font-semibold text-rose-900">완성된 릴스 {doneReels.length}개</p>
                  <span className="text-xs text-muted-foreground hidden sm:inline">— 다운로드해서 SNS에 올려보세요</span>
                </div>
                <div className="space-y-2">
                  {doneReels.map((reel) => {
                    const date = reel.scheduledAt
                      ? new Date(reel.scheduledAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })
                      : ''
                    return (
                      <div key={reel.reportId} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2.5">
                        <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                          <Film className="h-4 w-4 text-rose-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{reel.customerName}</p>
                          {date && <p className="text-xs text-muted-foreground">{date} 작업</p>}
                        </div>
                        <a
                          href={reel.reelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-colors shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />다운로드
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 📸 시공 사례 승인 대기 */}
            {pendingPortfolios.length > 0 && (
              <div className="px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Camera className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-900">시공 사례 {pendingPortfolios.length}건</p>
                  <span className="text-xs text-muted-foreground hidden sm:inline">— 공개하면 견적 페이지에 노출돼요</span>
                </div>
                <div className="space-y-2">
                  {pendingPortfolios.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                      {/* Before/After 미니 썸네일 */}
                      <div className="flex items-center gap-1 shrink-0">
                        {p.before_image_urls?.[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.before_image_urls[0]} alt="Before" className="w-9 h-9 rounded-lg object-cover border" />
                        )}
                        <span className="text-xs text-amber-500">→</span>
                        {p.after_image_urls?.[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.after_image_urls[0]} alt="After" className="w-9 h-9 rounded-lg object-cover border" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        {p.summary && <p className="text-xs text-muted-foreground truncate">{p.summary}</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingPost({ id: p.id, slug: '', title: p.title, summary: p.summary, published: false, ai_generated: true, published_at: '', image_url: null, image_urls: null, naver_title: null, naver_content: null, naver_tags: null, daangn_content: null, instagram_content: null, instagram_hashtags: null, post_type: 'portfolio', before_image_urls: p.before_image_urls, after_image_urls: p.after_image_urls })}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" /><span className="hidden sm:inline">수정</span>
                        </button>
                        <button
                          type="button"
                          disabled={isApproving || isRejecting}
                          onClick={() => approvePortfolio({ postId: p.id })}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />공개
                        </button>
                        <button
                          type="button"
                          disabled={isApproving || isRejecting}
                          onClick={() => { if (confirm('이 시공 사례를 삭제할까요?')) rejectPortfolio({ postId: p.id }) }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-60 transition-colors"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 📝 새로 올라온 글 — 채널에 올리기 */}
            {channelTodos.length > 0 && (
              <div className="px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Send className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">채널에 올릴 글 {channelTodos.length}개</p>
                  <span className="text-xs text-muted-foreground hidden sm:inline">— 복사해서 올린 뒤 “올렸어요”를 눌러주세요</span>
                </div>
                <div className="space-y-2">
                  {channelTodos.map((post) => (
                    <div key={post.id} className="rounded-xl border bg-slate-50/60 px-3 py-2.5 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
                      <div className="flex items-center gap-3 min-w-0 sm:flex-1">
                        {post.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Sparkles className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{post.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(post.published_at).toLocaleDateString('ko-KR')} 발행</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:shrink-0">
                        {renderChannelButtons(post)}
                        <button
                          type="button"
                          disabled={postingId === post.id}
                          onClick={() => { setPostingId(post.id); markChannelsPosted({ id: post.id }) }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 disabled:opacity-60 transition-colors"
                          title="네이버·당근·인스타에 다 올렸으면 눌러서 완료 처리하세요"
                        >
                          {postingId === post.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Check className="h-3.5 w-3.5" />}
                          올렸어요
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

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
                      {post.post_type === 'portfolio' && (
                        <Badge variant="secondary" className="text-xs shrink-0 bg-amber-100 text-amber-700">
                          <Camera className="h-3 w-3 mr-1" />시공사례
                        </Badge>
                      )}
                      {post.ai_generated && post.post_type !== 'portfolio' && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <Sparkles className="h-3 w-3 mr-1" />AI
                        </Badge>
                      )}
                      {!post.published && <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">비공개</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(post.published_at).toLocaleDateString('ko-KR')}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {renderChannelButtons(post)}
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingPost(post)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                      title="제목·내용 수정하기"
                    >
                      <Pencil className="h-3.5 w-3.5" />수정
                    </button>
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

      {/* 당근마켓용 글 모달 */}
      {daangnPost && daangnPost.daangn_content && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-[#FF6F0F] flex items-center justify-center text-sm">🥕</div>
                <div>
                  <p className="font-semibold text-sm">당근마켓 비즈프로필용 글</p>
                  <p className="text-xs text-muted-foreground">복사 후 당근 앱에서 붙여넣기 하세요</p>
                </div>
              </div>
              <button type="button" onClick={() => { setDaangnPost(null); setCopied(false) }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-5 flex-1">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-orange-50 rounded-xl p-4 border border-orange-100">
                {daangnPost.daangn_content}
              </pre>
            </div>
            <div className="px-5 py-4 border-t flex gap-2 shrink-0">
              <Button
                className="flex-1 h-12 gap-2 bg-[#FF6F0F] hover:bg-[#e5620d]"
                onClick={() => handleCopy(daangnPost.daangn_content!)}
              >
                {copied
                  ? <><CheckCircle2 className="h-4 w-4" />복사됐어요!</>
                  : <><Copy className="h-4 w-4" />복사하기</>
                }
              </Button>
              <a
                href="https://www.daangn.com/kr/business"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 h-12 rounded-md border border-[#FF6F0F] text-[#FF6F0F] text-sm font-medium hover:bg-orange-50 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                당근 열기
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 인스타그램용 글 모달 */}
      {instaPost && instaPost.instagram_content && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center text-white font-bold text-xs">IG</div>
                <div>
                  <p className="font-semibold text-sm">인스타그램 캡션</p>
                  <p className="text-xs text-muted-foreground">복사 후 인스타그램 앱에서 붙여넣기 하세요</p>
                </div>
              </div>
              <button type="button" onClick={() => { setInstaPost(null); setCopied(false) }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex-1 space-y-3">
              {/* 본문 */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">본문 캡션</p>
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-pink-50 rounded-xl p-4 border border-pink-100">
                  {instaPost.instagram_content}
                </pre>
              </div>
              {/* 해시태그 */}
              {instaPost.instagram_hashtags && instaPost.instagram_hashtags.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">해시태그</p>
                  <div className="flex flex-wrap gap-1.5">
                    {instaPost.instagram_hashtags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t flex gap-2 shrink-0">
              <Button
                className="flex-1 h-12 gap-2 bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] hover:opacity-90"
                onClick={() => {
                  const hashtags = instaPost.instagram_hashtags?.map((t) => `#${t}`).join(' ') ?? ''
                  handleCopy(`${instaPost.instagram_content}\n\n${hashtags}`)
                }}
              >
                {copied
                  ? <><CheckCircle2 className="h-4 w-4" />복사됐어요!</>
                  : <><Copy className="h-4 w-4" />전체 복사</>
                }
              </Button>
              <a
                href="https://www.instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 h-12 rounded-md border text-sm font-medium hover:bg-pink-50 transition-colors"
                style={{ borderColor: '#e6683c', color: '#e6683c' }}
              >
                <ExternalLink className="h-4 w-4" />
                인스타 열기
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 네이버 블로그용 글 모달 */}
      {naverPost && naverPost.naver_content && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-[#03C75A] flex items-center justify-center text-white font-bold text-sm">N</div>
                <div>
                  <p className="font-semibold text-sm">네이버 블로그용 글</p>
                  <p className="text-xs text-muted-foreground">복사 후 네이버 블로그에 붙여넣기 하세요</p>
                </div>
              </div>
              <button type="button" onClick={() => setNaverPost(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 제목 */}
            <div className="px-5 py-3 border-b bg-slate-50 shrink-0">
              <p className="text-xs text-muted-foreground mb-1">제목</p>
              <p className="font-semibold text-sm">{naverPost.naver_title}</p>
            </div>

            {/* 태그 */}
            {naverPost.naver_tags && naverPost.naver_tags.length > 0 && (
              <div className="px-5 py-2.5 border-b bg-slate-50 shrink-0 flex flex-wrap gap-1.5">
                {naverPost.naver_tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-[#03C75A]/10 text-[#03C75A] text-xs font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* 이미지 (있는 경우) */}
            {naverPost.image_url && (
              <div className="px-5 py-3 border-b bg-slate-50 shrink-0">
                <p className="text-xs text-muted-foreground mb-2">첨부 이미지 — 우클릭 후 저장하여 네이버 블로그에 업로드하세요</p>
                <img
                  src={naverPost.image_url}
                  alt="포스트 이미지"
                  className="rounded-lg w-full max-h-48 object-cover border"
                />
              </div>
            )}

            {/* 본문 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {naverPost.naver_content}
              </pre>
            </div>

            {/* 액션 버튼 */}
            <div className="px-5 py-4 border-t flex gap-2 shrink-0">
              <Button
                className="flex-1 h-12 gap-2"
                onClick={() => handleNaverCopy(`${naverPost.naver_title}\n\n${naverPost.naver_content}`)}
              >
                {copied
                  ? <><CheckCircle2 className="h-4 w-4" />복사됐어요!</>
                  : <><Copy className="h-4 w-4" />전체 복사</>
                }
              </Button>
              <a
                href="https://blog.naver.com/compose/write"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 h-12 rounded-md border border-[#03C75A] text-[#03C75A] text-sm font-medium hover:bg-[#03C75A]/10 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                블로그 열기
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 갤러리 모달 */}
      {galleryPost && (galleryPost.image_urls?.length ?? 0) > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-violet-100 flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-violet-700" />
                </div>
                <div>
                  <p className="font-semibold text-sm">생성된 이미지 ({galleryPost.image_urls!.length}장)</p>
                  <p className="text-xs text-muted-foreground">저장 후 네이버 블로그 등에 올려주세요</p>
                </div>
              </div>
              <button type="button" onClick={() => setGalleryPost(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {galleryPost.image_urls!.map((src, i) => (
                <div key={i} className="rounded-xl border overflow-hidden bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`이미지 ${i + 1}`} className="w-full aspect-[4/3] object-cover" />
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="flex items-center justify-center gap-1.5 h-10 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />저장하기
                  </a>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t shrink-0 text-xs text-muted-foreground text-center">
              이미지는 게시물당 한 번만 생성돼요 (크레딧 절약)
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
