'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { deletePostAction, getTopicSuggestionsAction, setMonthlyTargetAction, publishTodayAction, markChannelsPostedAction } from '@/lib/actions/posts'
import { approvePortfolioAction, rejectPortfolioAction } from '@/lib/actions/portfolio'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { FileText, ExternalLink, Trash2, Loader2, Zap, CheckCircle2, Clock, CalendarDays, Play, Copy, X, ImageIcon, Download, Camera, Check, XIcon, Pencil, Film, ListChecks, Send, SkipForward, Save, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { getPlanLabel } from '@/lib/config/plans'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import type { PostPlan } from '@/lib/geo/post-plan'
import { copyRichText, markdownToPlain } from '@/lib/utils/rich-text'
import { toast } from 'sonner'

interface TopicSuggestion {
  title: string
  reason: string
  topic: string
  keyword?: string
  monthlySearches?: number
  competition?: string
}

interface SuggestionCache {
  monthKey: string
  suggestions: TopicSuggestion[]
}

// 주제는 '월 단위'로 고정 — 같은 달엔 브라우저 캐시를 재사용해 서버 호출도 하지 않음
// (서버도 businesses.topic_suggestions_month로 월 단위 고정하므로 다른 기기에서도 재생성 안 됨)
function getMonthKey(businessId: string): string {
  const now = new Date()
  return `qualio_suggestions_${businessId}_${now.getFullYear()}_m${now.getMonth() + 1}`
}

// v2: 검색량 데이터 도입 — 이전(검색량 없는) 캐시를 무시하고 서버에서 새로 받도록 키 버전업
const TOPIC_CACHE_KEY = 'qualio_topic_cache_v2'

function loadCache(businessId: string): SuggestionCache | null {
  try {
    const raw = localStorage.getItem(TOPIC_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as SuggestionCache
    if (cache.monthKey !== getMonthKey(businessId)) return null
    return cache
  } catch {
    return null
  }
}

function saveCache(businessId: string, suggestions: TopicSuggestion[]) {
  try {
    localStorage.setItem(TOPIC_CACHE_KEY, JSON.stringify({ monthKey: getMonthKey(businessId), suggestions }))
  } catch { /* 무시 */ }
}

interface Post {
  id: string
  slug: string
  title: string
  content?: string | null
  summary: string | null
  published: boolean
  ai_generated: boolean
  published_at: string
  image_url: string | null
  image_urls: string[] | null
  naver_title: string | null
  naver_content: string | null
  naver_tags: string[] | null
  daangn_title: string | null
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
  content?: string | null
  summary: string | null
  before_image_urls: string[]
  after_image_urls: string[]
}

interface PostListProps {
  posts: Post[]
  businessSlug: string | null
  businessId: string
  monthlyTarget: number
  autoPostLimit: number
  /** 자동 글쓰기를 켤 수 있는 상태인지 + 뭐가 비었는지 */
  autoPostReadiness?: {
    ready: boolean
    items: { label: string; why: string; href: string; done: boolean }[]
  }
  planId: string
  isTodayComplete: boolean
  pendingPortfolios?: PendingPortfolio[]
  // 오늘 글을 몇 편 더 만들 수 있는지 (하루 한도 — 원가 보호 + 몰아쓰기로 인한 검색 순위 하락 방지)
  // 서버가 이번 달 저장된 주제를 넘겨줌 — 있으면 재조회·스피너 없이 바로 표시
  initialSuggestions?: TopicSuggestion[] | null
  // 사장님 네이버 블로그 아이디 — '블로그 열기'가 이 블로그 글쓰기로 연결 (없으면 일반 글쓰기)
  naverBlogId?: string | null
  // 사장님 당근 비즈프로필 주소 — '당근 열기'가 이 프로필로 연결 (없으면 당근 비즈니스 홈)
  danggeunBusinessUrl?: string | null
  // 이번 달 고정 자동 발행 계획표(서버에서 확정·저장) — 달력이 이 계획을 그대로 표시
  postPlan?: PostPlan | null
}

interface ScheduleSlot {
  day: number
  date: Date
  post: Post | null
  topicLabel: string
  status: 'published' | 'today' | 'upcoming'
  monthlySearches?: number  // 발행 예정 주제의 실제 월 검색량 (있으면 배지 표시)
  competition?: string      // 경쟁도 '낮음'|'중간'|'높음'
  geoTargeted?: boolean     // GEO 측정 '안 잡히는 질문'을 공략하는 슬롯 (AI 검색 우선)
}

// 고정 계획표(postPlan) + 실제 발행 글로 달력을 만든다.
// 계획은 서버에서 월 1회 확정·저장돼 불변이므로, 예정 주제가 렌더마다 바뀌지 않는다.
// 발행된 날짜엔 실제 글을, 그 외 계획된 날짜엔 계획 주제를 표시한다.
function buildSchedule(plan: PostPlan | null, posts: Post[]): ScheduleSlot[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()

  // 이번 달 발행 글: day → post
  const postsByDay = new Map<number, Post[]>()
  posts.forEach((p) => {
    const d = new Date(p.published_at)
    if (p.published && d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate()
      if (!postsByDay.has(day)) postsByDay.set(day, [])
      postsByDay.get(day)!.push(p)
    }
  })

  // 계획 슬롯: day → slot (한 날짜엔 하나)
  const planByDay = new Map<number, PostPlan['slots'][number]>()
  ;(plan?.slots ?? []).forEach((s) => { if (!planByDay.has(s.day)) planByDay.set(s.day, s) })

  // 표시할 날짜 = 발행된 날 ∪ 계획된 날
  const allDays = [...new Set<number>([...postsByDay.keys(), ...planByDay.keys()])].sort((a, b) => a - b)

  const result: ScheduleSlot[] = []
  for (const day of allDays) {
    const date = new Date(year, month, day)
    const post = postsByDay.get(day)?.[0] ?? null

    // 발행 완료 슬롯 — 실제 제목 그대로
    if (post) {
      result.push({ day, date, post, topicLabel: post.title, status: 'published' })
      continue
    }
    // 발행 안 된 날: 계획이 있고 오늘 이후면 표시 (과거 미발행은 숨김)
    const slot = planByDay.get(day)
    if (!slot || day < today) continue
    result.push({
      day, date, post: null,
      topicLabel: slot.label,
      status: day === today ? 'today' : 'upcoming',
      geoTargeted: slot.geoTargeted,
      monthlySearches: slot.monthlySearches,
      competition: slot.competition,
    })
  }
  return result
}

// 한 줄로 이어진 글 목록의 한 칸 — 이미 올라간 글(post)과 앞으로 올라갈 글(plan)을 같은 목록에서 다룬다
type TimelineRow =
  | { kind: 'post'; key: string; date: Date; post: Post }
  | { kind: 'plan'; key: string; date: Date; slot: ScheduleSlot }

// 날짜칩 표기 — KST 기준 '8/15'와 아랫줄('금', 다른 해면 '25년')
function dateChip(date: Date, currentYear: number) {
  const md = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' })
    .format(date).replace(/\s/g, '').replace(/\.$/, '').replace('.', '/')
  const year = Number(new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(date))
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' }).format(date)
  return { md, sub: year === currentYear ? weekday : `${String(year).slice(2)}년` }
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

// ── 이미지 갤러리 모달 ──
function ImageGalleryModal({
  images,
  title,
  onClose,
}: {
  images: string[]
  title: string
  onClose: () => void
}) {
  const [viewingIdx, setViewingIdx] = useState<number | null>(null)
  const [savingIdx, setSavingIdx] = useState<number | null>(null)

  const handleSave = async (src: string, idx: number) => {
    setSavingIdx(idx)
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}_${idx + 1}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('저장됐어요!')
    } catch {
      toast.error('저장에 실패했어요. 다시 시도해주세요')
    } finally {
      setSavingIdx(null)
    }
  }

  // 확대 보기
  if (viewingIdx !== null) {
    const src = images[viewingIdx]
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewingIdx(null)}>
        <ScrollLock />
        <div ref={(el) => el?.focus()} tabIndex={-1} className="relative max-w-4xl max-h-[90vh] w-full overscroll-contain outline-none" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setViewingIdx(null)}
            className="absolute -top-10 right-0 text-white/80 hover:text-white p-1"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
          <button
            type="button"
            disabled={savingIdx === viewingIdx}
            onClick={() => handleSave(src, viewingIdx)}
            className="mt-3 mx-auto flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {savingIdx === viewingIdx
              ? <><Loader2 className="h-4 w-4 animate-spin" />저장 중...</>
              : <><Save className="h-4 w-4" />이 이미지 저장하기</>}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <ScrollLock />
      <div ref={(el) => el?.focus()} tabIndex={-1} className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overscroll-contain shadow-2xl outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-violet-100 flex items-center justify-center">
              <ImageIcon className="h-4 w-4 text-violet-700" />
            </div>
            <div>
              <p className="font-semibold text-sm">생성된 이미지 ({images.length}장)</p>
              <p className="text-xs text-muted-foreground">이미지를 눌러 크게 보고 저장할 수 있어요</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {images.map((src, i) => (
            <div key={i} className="rounded-xl border overflow-hidden bg-slate-50 group">
              <button
                type="button"
                onClick={() => setViewingIdx(i)}
                className="w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`이미지 ${i + 1}`}
                  className="w-full aspect-[4/3] object-cover cursor-pointer group-hover:opacity-90 transition-opacity"
                />
              </button>
              <button
                type="button"
                disabled={savingIdx === i}
                onClick={() => handleSave(src, i)}
                className="flex items-center justify-center gap-1.5 w-full h-10 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
              >
                {savingIdx === i
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />저장 중...</>
                  : <><Download className="h-3.5 w-3.5" />저장하기</>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 릴스 미리보기 + 저장 카드 ──
export function PostList({ posts: initialPosts, businessSlug, businessId, monthlyTarget: initialTarget, autoPostLimit, autoPostReadiness, planId, isTodayComplete, pendingPortfolios = [], initialSuggestions = null, naverBlogId = null, danggeunBusinessUrl = null, postPlan = null }: PostListProps) {
  const [posts] = useState(initialPosts)
  // 오름차순 정렬 (오래된 글 위 → 최신 글 아래) + 오늘 위치로 자동 스크롤
  const sortedPosts = [...posts].sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime())
  const postListRef = useRef<HTMLDivElement>(null)

  // 컨테이너 내부 스크롤만 조정 (페이지 전체 스크롤 건드리지 않음)
  // 지난 글 → 오늘 → 앞으로 올라갈 글이 한 목록이라, 열자마자 '오늘' 자리가 보이게 맞춘다
  const scrollToToday = useCallback(() => {
    requestAnimationFrame(() => {
      const container = postListRef.current
      if (!container) return

      // URL 해시가 있으면 해당 게시물로 (저장 후 복귀용)
      const hash = window.location.hash.slice(1)
      if (hash) {
        const target = document.getElementById(hash)
        if (target) {
          container.scrollTop = target.offsetTop - container.offsetTop
          window.history.replaceState(null, '', window.location.pathname)
          return
        }
      }

      // 오늘 KST 기준 첫 글 찾기
      const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const todayFirst = sortedPosts.find((p) => {
        const pKST = new Date(new Date(p.published_at).getTime() + 9 * 60 * 60 * 1000)
        return pKST.toISOString().slice(0, 10) >= todayStr
      })

      if (todayFirst) {
        const el = document.getElementById(`post-${todayFirst.id}`)
        if (el) container.scrollTop = el.offsetTop - container.offsetTop
        return
      }

      // 오늘 올라간 글이 없으면 '오늘 예정' 칸으로, 그것도 없으면 맨 아래로
      const todayDay = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDate()
      const todaySlot = document.getElementById(`schedule-day-${todayDay}`)
      if (todaySlot) container.scrollTop = todaySlot.offsetTop - container.offsetTop
      else container.scrollTop = container.scrollHeight
    })
  }, [sortedPosts])

  useEffect(() => { scrollToToday() }, [scrollToToday])

  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(initialSuggestions)
  // 오늘 이미 발행 완료된 경우 버튼 초기 상태를 완료로 설정
  const [publishResult, setPublishResult] = useState<{ published: number; message?: string } | null>(
    isTodayComplete ? { published: 0, message: '오늘 발행 완료!' } : null
  )
  const [naverPost, setNaverPost] = useState<Post | null>(null)
  const [daangnPost, setDaangnPost] = useState<Post | null>(null)
  const [instaPost, setInstaPost] = useState<Post | null>(null)
  const [galleryPost, setGalleryPost] = useState<Post | null>(null)
  const [postingId, setPostingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // 홈페이지 주소 복사 완료 표시 — 헤더 '링크 복사' 버튼 전용
  const [landingCopied, setLandingCopied] = useState(false)
  // 오늘 자동 발행 시간(오전 9시 KST)이 지났는지 — 하이드레이션 불일치 방지 위해 마운트 후 계산
  const [autoTimePassed, setAutoTimePassed] = useState(false)
  useEffect(() => {
    const h = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false, hourCycle: 'h23',
    }).format(new Date())
    setAutoTimePassed(parseInt(h, 10) >= 9)
  }, [])

  const handleCopy = (content: string) => {
    // 당근·인스타 등 서식 없는 채널 — 마크다운 기호(##, ** 등)를 제거한 깔끔한 텍스트로 복사
    navigator.clipboard.writeText(markdownToPlain(content))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  // 홈페이지 주소 — 고객에게 공유하는 내 업체 소개 페이지(/biz/[slug])
  const landingUrl = businessSlug ? `${appUrl}/biz/${businessSlug}` : null
  const handleCopyLanding = () => {
    if (!landingUrl) return
    navigator.clipboard.writeText(landingUrl)
    setLandingCopied(true)
    toast.success('홈페이지 주소를 복사했어요!')
    setTimeout(() => setLandingCopied(false), 2000)
  }
  // 네이버 블로그 — 서식 HTML을 함께 복사해 붙여넣으면 소제목·인용구가 자동 적용됨
  const handleNaverCopy = async (content: string, title?: string) => {
    await copyRichText(content, title)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  // 네이버 블로그용 — 자동 생성 이미지 전부를 한 번에 내려받기
  // (직원이 드라이브를 왕복하지 않고 다운로드 폴더에서 바로 블로그에 첨부하도록)
  const [savingAllImages, setSavingAllImages] = useState(false)
  const handleSaveAllImages = async (urls: string[], title: string) => {
    setSavingAllImages(true)
    try {
      for (let i = 0; i < urls.length; i++) {
        const res = await fetch(urls[i])
        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = `${title}_${i + 1}.jpg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(objectUrl)
        // 브라우저가 연속 다운로드를 차단하지 않도록 약간의 간격을 둔다
        await new Promise((r) => setTimeout(r, 400))
      }
      toast.success(`이미지 ${urls.length}장을 저장했어요!`)
    } catch {
      toast.error('이미지 저장을 못 했어요. 다시 눌러주세요')
    } finally {
      setSavingAllImages(false)
    }
  }

  // 목록에서 보고 있는 달 (0 = 이번 달, -1 = 지난 달)
  const [monthOffset, setMonthOffset] = useState(0)
  // KST 기준 'YYYY-MM' — Vercel(UTC)에서도 한국 날짜로 달을 가른다
  const monthKeyOf = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Seoul' }).format(d).slice(0, 7)

  const now = new Date()
  const postsThisMonth = posts.filter((p) => {
    const d = new Date(p.published_at)
    return p.published && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const progressPct = autoPostLimit > 0 ? Math.min((postsThisMonth / autoPostLimit) * 100, 100) : 0
  const schedule = buildSchedule(postPlan, posts)

  // 아직 채널에 안 올린 글 (포트폴리오 제외, 채널 콘텐츠 있고 완료 처리 안 된 것)
  const channelTodos = posts.filter((p) => {
    if (p.post_type === 'portfolio' || !p.published) return false
    if (!(p.naver_content || p.daangn_content || p.instagram_content)) return false
    return !p.channel_posted_at
  })

  // 사장님이 처리해야 할 작업물 총합
  // (이미지 미등록은 알리지 않음 — 글에 실리는 사진은 공개 승인된 작업보고 사진뿐이고,
  //  그 밖의 사진은 글별 '수정'에서 사장님이 직접 올린다)
  // ⚠️릴스는 위 '홍보 영상' 카드 한 곳에서만 센다 — 여기서 또 세면 같은 일이 두 번 있는 것처럼 보인다
  const totalTodos = pendingPortfolios.length + channelTodos.length

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

  // 자동 글쓰기 켜기/끄기 — 화면에 들어오기만 하면 켜지던 것을 사장님이 정하도록 바꿨다.
  // ⚠️예전엔 이 화면을 열면 무조건 켜졌다. 그래서 마케팅 메뉴를 안 눌러본 업체는 영영 안 켜졌고,
  //   반대로 세팅이 안 끝난 업체가 잠깐 들렀다는 이유로 켜지기도 했다.
  const [autoPostOn, setAutoPostOn] = useState(initialTarget > 0)
  const { execute: saveTarget, isPending: isSavingTarget } = useAction(setMonthlyTargetAction, {
    onSuccess: () => {
      toast.success(autoPostOn ? '자동 글쓰기를 켰어요. 내일 아침부터 올라가요' : '자동 글쓰기를 껐어요')
      window.location.reload()
    },
    onError: ({ error }) => {
      setAutoPostOn((v) => !v) // 실패했으면 화면을 원래대로 되돌린다
      toast.error(error.serverError ?? '설정을 저장하지 못했어요')
    },
  })

  const toggleAutoPost = () => {
    const next = !autoPostOn
    setAutoPostOn(next)
    saveTarget({ target: next ? autoPostLimit : 0 })
  }

  useEffect(() => {
    // 서버가 이번 달 주제를 이미 넘겨줬으면 재조회하지 않음 (한 달간 고정 — 스피너 없음)
    if (initialSuggestions && initialSuggestions.length > 0) {
      saveCache(businessId, initialSuggestions)
    } else {
      const cached = loadCache(businessId)
      if (cached) setSuggestions(cached.suggestions)
      else fetchSuggestions({}) // 그 달 첫 방문에만 생성 (이후엔 서버·DB에 고정 저장돼 재사용)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

const { execute: deletePost, isPending: isDeleting } = useAction(deletePostAction, {
    onSuccess: () => { toast.success('삭제됐습니다'); window.location.reload() },
    onError: ({ error }) => { toast.error(error.serverError ?? '삭제에 실패했습니다') },
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
    // 응답이 늦거나 유실돼도 글은 서버에 저장됐을 수 있어, 실패 단정 대신 새로고침 안내
    onError: ({ error }) => {
      toast.error(error.serverError ?? '발행이 오래 걸리고 있어요. 잠시 후 새로고침해 오늘 글이 올라왔는지 확인해 주세요')
    },
  })

  // 무한 로딩 방지 워치독 — 발행이 150초를 넘으면(응답 유실 등) 자동 새로고침.
  // scale 플랜은 심층 글+채널 원고로 1~2분 걸리므로 그보다 여유를 둔다.
  // 글은 서버에서 먼저 저장되므로, 새로고침하면 목록에 반영돼 로딩이 풀린다.
  useEffect(() => {
    if (!isPublishing) return
    const t = setTimeout(() => window.location.replace(window.location.pathname), 150_000)
    return () => clearTimeout(t)
  }, [isPublishing])

const postUrl = (slug: string) => businessSlug ? `${appUrl}/biz/${businessSlug}/posts/${slug}` : null
  const upcomingCount = schedule.filter((s) => s.status === 'upcoming' || s.status === 'today').length

  // 목록은 '한 달치'만 보여준다 — 글은 홈페이지에 계속 쌓이므로, 대시보드에서 몇 년치를
  // 스크롤할 이유가 없다. 지난 달이 필요하면 화살표로 한 달씩 거슬러 올라간다.
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const viewMonthKey = monthKeyOf(viewDate)
  const monthPosts = sortedPosts.filter((p) => monthKeyOf(new Date(p.published_at)) === viewMonthKey)
  // 발행 계획은 이번 달 것만 있으므로 지난 달을 볼 땐 예정 줄이 없다
  const upcomingSlots = monthOffset === 0 ? schedule.filter((s) => !s.post) : []

  // 글 목록 하나로 합치기 — 이미 올라간 글(오래된 순) 뒤에 앞으로 올라갈 글(날짜 순)을 이어 붙인다.
  // 예전엔 '발행 일정'과 '전체 발행 포스트'가 따로 있어 이번 달 글이 두 곳에 똑같이 보였다.
  const timeline: TimelineRow[] = [
    ...monthPosts.map((p): TimelineRow => ({ kind: 'post', key: p.id, date: new Date(p.published_at), post: p })),
    ...upcomingSlots.map((s): TimelineRow => ({ kind: 'plan', key: `plan-${s.day}`, date: s.date, slot: s })),
  ]
  const currentYear = now.getFullYear()
  // 가장 오래된 글이 있는 달보다 더 뒤로는 못 가게 (빈 달만 계속 나오는 걸 막는다)
  const oldestMonthKey = sortedPosts.length > 0 ? monthKeyOf(new Date(sortedPosts[0].published_at)) : viewMonthKey
  const canGoPrev = viewMonthKey > oldestMonthKey
  const canGoNext = monthOffset < 0
  const goMonth = (delta: number) => {
    setMonthOffset((v) => v + delta)
    if (postListRef.current) postListRef.current.scrollTop = 0
  }

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
      {/* 사진이 붙은 글에만 보기 버튼 노출 (작업보고 실사진 또는 사장님이 직접 올린 사진) */}
      {(post.image_urls?.length ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => setGalleryPost(post)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-violet-700 bg-violet-100 hover:bg-violet-200 transition-colors"
          title="생성된 이미지 보기"
        >
          <ImageIcon className="h-3.5 w-3.5" />{post.image_urls!.length}
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
          <div className="divide-y max-h-[520px] overflow-y-auto overscroll-contain">

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
                        <a
                          href={`/dashboard/marketing/write?id=${p.id}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" /><span className="hidden sm:inline">수정</span>
                        </a>
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
                            <FileText className="h-4 w-4 text-primary" />
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
                        <button
                          type="button"
                          disabled={postingId === post.id}
                          onClick={() => { if (confirm('이 글을 채널에 올리지 않고 건너뛸까요?')) { setPostingId(post.id); markChannelsPosted({ id: post.id }) } }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-60 transition-colors"
                          title="채널에 올리지 않고 완료 처리"
                        >
                          <SkipForward className="h-3 w-3" />건너뛰기
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

      {/* 자동 글쓰기 상태 — 세 가지로 갈린다.
          ★재료 부족이 최우선이다. 켜져 있어도 재료가 없으면 크론이 건너뛰므로 실제로는 안 나간다.
            그때 "발행 중"이라고 보여주면 화면이 또 거짓말을 하게 된다. */}
      {autoPostReadiness && !autoPostReadiness.ready ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2.5">
          <p className="font-bold text-amber-900">
            {autoPostOn ? '자동 글쓰기가 멈춰 있어요' : '자동 글쓰기가 꺼져 있어요'}
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            {autoPostOn
              ? '아래 두 가지가 있어야 글을 쓸 수 있어요. 채워주시면 다음 날 아침부터 다시 올라가요.'
              : '켜두시면 매일 아침 9시에 홍보 글이 한 편씩 알아서 올라가요. 먼저 아래 두 가지를 채워주세요.'}
          </p>
          <div className="space-y-2">
            {autoPostReadiness.items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 ${
                  item.done ? 'border-emerald-200' : 'border-amber-300 hover:border-amber-400'
                }`}
              >
                {item.done ? (
                  <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <span className="h-4 w-4 rounded-full border-2 border-amber-400 mt-0.5 shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${item.done ? 'text-emerald-800' : 'text-amber-950'}`}>
                    {item.label}
                  </span>
                  {!item.done && <span className="block text-xs text-amber-800 mt-0.5">{item.why}</span>}
                </span>
                {!item.done && <span className="text-xs text-amber-900 shrink-0 mt-0.5">채우기 →</span>}
              </Link>
            ))}
          </div>
        </div>
      ) : !autoPostOn ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-2.5">
          <p className="font-bold text-amber-900">자동 글쓰기가 꺼져 있어요</p>
          <p className="text-xs text-amber-800 leading-relaxed">
            켜두시면 <b>매일 아침 9시</b>에 홍보 글이 한 편씩 알아서 올라가요.
            글이 쌓이는 만큼 네이버·구글 검색과 AI 검색에 우리 업체가 잡히기 시작합니다.
            <br />
            지금은 아무 글도 안 올라가고 있어요.
          </p>
          <Button
            type="button"
            className="w-full h-11"
            disabled={isSavingTarget}
            onClick={toggleAutoPost}
          >
            {isSavingTarget ? '켜는 중...' : `자동 글쓰기 켜기 (월 ${autoPostLimit}편)`}
          </Button>
        </div>
      ) : null}

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
          {/* ⚠️플랜 한도가 아니라 '실제로 설정된 값'을 보여준다.
              예전엔 autoPostLimit을 띄워서, 꺼져 있어도 "월 목표 24"로 보였다(화면이 거짓말했다) */}
          <p className={`text-2xl font-bold ${autoPostOn && autoPostReadiness?.ready !== false ? 'text-slate-400' : 'text-slate-300'}`}>
            {autoPostOn && autoPostReadiness?.ready !== false ? autoPostLimit : 0}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">월 목표</p>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Zap className={`h-3 w-3 ${autoPostOn && autoPostReadiness?.ready !== false ? 'text-primary' : 'text-slate-300'}`} />
            {autoPostReadiness && !autoPostReadiness.ready ? (
              <span className="text-slate-500">재료가 채워지면 발행이 시작돼요</span>
            ) : autoPostOn ? (
              <>매일 오전 9시 자동 발행 중 — <span className="font-medium">{getPlanLabel(planId)}</span> 플랜</>
            ) : (
              <span className="text-slate-500">자동 글쓰기가 꺼져 있어요</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            {autoPostOn && (
              <button
                type="button"
                className="underline text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={isSavingTarget}
                onClick={() => {
                  if (confirm('자동 글쓰기를 끌까요?\n\n끄면 내일부터 글이 올라가지 않아요.')) toggleAutoPost()
                }}
              >
                끄기
              </button>
            )}
            {Math.round(progressPct)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* ── 내 홈페이지 글 — 이미 올라간 글과 앞으로 올라갈 글을 한 목록으로 ──
           (예전엔 '발행 일정'과 '전체 발행 포스트' 두 박스로 나뉘어 이번 달 글이 양쪽에 똑같이 보였다) */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b bg-slate-50 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <p className="font-semibold text-sm">내 홈페이지 글</p>
              {isLoadingSuggestions && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />주제 불러오는 중
                </span>
              )}
            </div>
            {landingUrl && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleCopyLanding}
                className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs font-medium text-slate-700 bg-white border hover:bg-slate-100 transition-colors"
                title="홈페이지 주소 복사하기"
              >
                {landingCopied
                  ? <><Check className="h-3.5 w-3.5 text-emerald-600" />복사됨</>
                  : <><Copy className="h-3.5 w-3.5" />링크 복사</>}
              </button>
              <a
                href={landingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition-colors"
                title="새 창에서 내 홈페이지 보기"
              >
                <ExternalLink className="h-3.5 w-3.5" />홈페이지 열기
              </a>
            </div>
            )}
          </div>

          {/* 달 이동 — 한 달치만 보여주고, 지난 달은 화살표로 거슬러 올라간다 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-lg border bg-white p-0.5">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                disabled={!canGoPrev}
                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="지난 달 보기"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-sm font-semibold min-w-[104px] text-center">
                {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
              </span>
              <button
                type="button"
                onClick={() => goMonth(1)}
                disabled={!canGoNext}
                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="다음 달 보기"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              올라간 글 {monthPosts.length}편
              {monthOffset === 0 && upcomingCount > 0 ? ` · 앞으로 올라갈 글 ${upcomingCount}편` : ''}
            </p>
          </div>
        </div>

        {timeline.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {monthOffset === 0
              ? '아직 올라간 글이 없어요. 아래 ‘지금 발행’을 누르면 첫 글이 올라가요'
              : `${viewDate.getMonth() + 1}월엔 올라간 글이 없어요`}
          </div>
        ) : (
          <div ref={postListRef} className="divide-y max-h-[560px] overflow-y-auto overscroll-contain">
            {timeline.flatMap((row, i) => {
              const chip = dateChip(row.date, currentYear)
              const nodes = []

              // 앞으로 올라갈 글이 시작되는 자리에 구분 줄 하나 (색 범례 대신 말로 알려줌)
              if (row.kind === 'plan' && timeline[i - 1]?.kind !== 'plan') {
                nodes.push(
                  <div key="upcoming-divider" className="px-4 sm:px-5 py-2 bg-slate-50 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />여기부터는 앞으로 올라갈 글이에요
                  </div>
                )
              }

              // ① 이미 올라간 글 — 열기·수정·삭제와 채널 복사 버튼
              if (row.kind === 'post') {
                const post = row.post
                const url = postUrl(post.slug)
                nodes.push(
                  <div key={row.key} id={`post-${post.id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50">
                    <div className="w-14 shrink-0 text-center rounded-lg py-1.5 bg-emerald-100">
                      <p className="text-xs font-semibold text-emerald-700">{chip.md}</p>
                      <p className="text-xs text-emerald-600">{chip.sub}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{post.title}</p>
                        {post.post_type === 'portfolio' && (
                          <Badge variant="secondary" className="text-xs shrink-0 bg-amber-100 text-amber-700">
                            <Camera className="h-3 w-3 mr-1" />시공사례
                          </Badge>
                        )}
                        {!post.published && <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">비공개</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {renderChannelButtons(post)}
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" title="올라간 글 보기">
                          <Button size="icon" variant="ghost" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                      <a
                        href={`/dashboard/marketing/write?id=${post.id}`}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                        title="제목·내용 수정하기"
                      >
                        <Pencil className="h-3.5 w-3.5" />수정
                      </a>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" disabled={isDeleting}
                        onClick={() => { if (confirm('포스트를 삭제할까요?')) deletePost({ id: post.id }) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
                return nodes
              }

              // ② 앞으로 올라갈 글 — 아직 글이 없으니 주제와 발행 시각만
              const slot = row.slot
              const isToday = slot.status === 'today'
              nodes.push(
                <div
                  key={row.key}
                  id={`schedule-day-${slot.day}`}
                  className={`flex items-center gap-3 px-4 sm:px-5 py-3 ${isToday ? 'bg-blue-50' : ''}`}
                >
                  <div className={`w-14 shrink-0 text-center rounded-lg py-1.5 ${isToday ? 'bg-blue-100' : 'bg-slate-100'}`}>
                    <p className={`text-xs font-semibold ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>{chip.md}</p>
                    <p className={`text-xs ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>{chip.sub}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isToday ? 'font-medium text-blue-800' : 'text-muted-foreground'}`}>
                      {slot.topicLabel}
                    </p>
                    {/* GEO 약점 공략 배지 — AI 검색에서 아직 안 잡히는 질문을 우선 발행 */}
                    {slot.geoTargeted && (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">
                          🔎 AI 검색 공략
                        </span>
                      </div>
                    )}
                    {/* 실제 검색량·경쟁도 배지 — 데이터가 있을 때만 (근거 있는 주제 선정) */}
                    {slot.monthlySearches !== undefined && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">
                          🔍 월 {slot.monthlySearches.toLocaleString()}회
                        </span>
                        {slot.competition && (
                          <span className={`inline-flex items-center text-[11px] font-medium rounded px-1.5 py-0.5 ${
                            slot.competition === '낮음' ? 'text-emerald-700 bg-emerald-50'
                            : slot.competition === '중간' ? 'text-amber-700 bg-amber-50'
                            : 'text-rose-700 bg-rose-50'
                          }`}>
                            경쟁 {slot.competition}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`shrink-0 flex items-center gap-1 text-[11px] font-medium ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                    <Clock className={`h-3.5 w-3.5 ${isToday ? 'animate-pulse' : ''}`} />
                    {isToday ? '오늘 9시 발행' : '발행 예정'}
                  </div>
                </div>
              )
              return nodes
            })}
          </div>
        )}
      </div>

      {/* 자동 발행 시간이 지났는데 오늘 글이 아직이면 — 직접 발행하도록 안내 */}
      {schedule.some((s) => s.status === 'today') && autoTimePassed && !isTodayComplete && !isPublishing && publishResult === null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
          <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 leading-relaxed">
            오늘 자동 발행 시간(오전 9시)이 지났어요. 아래 <span className="font-semibold">&quot;지금 발행&quot;</span>을 누르면 오늘 글이 바로 올라가요.
          </p>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => { setPublishResult(null); publishToday({}) }}
          disabled={isPublishing || publishResult?.published === 0}
          className="gap-2"
          variant={publishResult !== null && !isPublishing ? 'outline' : 'default'}
        >
          {isPublishing
            ? <><Loader2 className="h-4 w-4 animate-spin" />홍보 글을 작성 중이에요...</>
            : publishResult !== null
              ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" />{publishResult.published > 0 ? `${publishResult.published}건 발행됐어요!` : '오늘 발행 완료!'}</>
              : <><Play className="h-4 w-4" />지금 발행</>
          }
        </Button>
      </div>

      {/* 하루 한두 편이 가장 좋은 이유 — 글이 매일 자동으로 나가는 이유를 납득시킨다 */}
      <p className="text-xs text-muted-foreground -mt-1">
        글은 매일 오전 9시에 한 편씩 자동으로 올라가요.
        하루에 몰아서 올리면 네이버·구글이 &lsquo;찍어낸 글&rsquo;로 보고 홈페이지 순위를 낮추기 때문에, 매일 한두 편씩 꾸준히 올리는 게 검색에 가장 잘 잡혀요.
      </p>

      {/* 발행 중 안내 — 오래 걸려도 새로고침·재클릭하지 않도록 (중복 발행 방지) */}
      {isPublishing && (
        <p className="text-xs text-muted-foreground -mt-1">
          전문가 데이터로 글과 SNS 원고까지 만드는 중이라 최대 1~2분 걸려요. 새로고침하거나 다시 누르지 말고 잠시만 기다려 주세요.
        </p>
      )}

      {/* 글 목록은 위 '내 홈페이지 글' 한 곳으로 합쳤다 (홈페이지 열기·링크 복사도 그 헤더에 있음) */}

      {/* 당근마켓용 글 모달 */}
      {daangnPost && daangnPost.daangn_content && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <ScrollLock />
          <div ref={(el) => el?.focus()} tabIndex={-1} className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overscroll-contain shadow-2xl outline-none">
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
            {/* 제목 — 당근 목록·미리보기에서 첫 줄이 제목처럼 노출되므로 맨 앞에 보여줌 */}
            {daangnPost.daangn_title && (
              <div className="px-5 py-3 border-b bg-orange-50/60 shrink-0">
                <p className="text-xs text-muted-foreground mb-1">제목</p>
                <p className="font-semibold text-sm">{daangnPost.daangn_title}</p>
              </div>
            )}
            <div className="px-5 py-5 flex-1 overflow-y-auto overscroll-contain min-h-0">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-orange-50 rounded-xl p-4 border border-orange-100">
                {markdownToPlain(daangnPost.daangn_content ?? '')}
              </pre>
            </div>
            <div className="px-5 py-4 border-t flex gap-2 shrink-0">
              <Button
                className="flex-1 h-12 gap-2 bg-[#FF6F0F] hover:bg-[#e5620d]"
                // 복사 시 제목을 맨 앞에 붙여 당근 글 상자에 통째로 붙여넣도록(당근은 제목 칸이 따로 없음)
                onClick={() => handleCopy(
                  daangnPost.daangn_title
                    ? `${daangnPost.daangn_title}\n\n${daangnPost.daangn_content}`
                    : daangnPost.daangn_content!,
                )}
              >
                {copied
                  ? <><CheckCircle2 className="h-4 w-4" />복사됐어요!</>
                  : <><Copy className="h-4 w-4" />복사하기</>
                }
              </Button>
              <a
                href={danggeunBusinessUrl || 'https://www.daangn.com/kr/business'}
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
          <ScrollLock />
          <div ref={(el) => el?.focus()} tabIndex={-1} className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overscroll-contain shadow-2xl outline-none">
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
            <div className="px-5 py-4 flex-1 space-y-3 overflow-y-auto overscroll-contain min-h-0">
              {/* 본문 */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">본문 캡션</p>
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-pink-50 rounded-xl p-4 border border-pink-100">
                  {markdownToPlain(instaPost.instagram_content ?? '')}
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
          <ScrollLock />
          <div ref={(el) => el?.focus()} tabIndex={-1} className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overscroll-contain shadow-2xl outline-none">
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

            {/* 첨부 이미지 — 자동 생성된 전체 이미지를 보여주고, 아래 버튼으로 한 번에 저장 */}
            {(naverPost.image_urls?.length || naverPost.image_url) && (
              <div className="px-5 py-3 border-b bg-slate-50 shrink-0">
                <p className="text-xs text-muted-foreground mb-2">첨부 사진 — 아래 “사진 전부 저장”을 누른 뒤, 네이버 글쓰기에서 사진으로 올려주세요</p>
                <div className="flex gap-2 overflow-x-auto overscroll-contain">
                  {(naverPost.image_urls?.length ? naverPost.image_urls : [naverPost.image_url!]).map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`포스트 사진 ${i + 1}`}
                      className="rounded-lg h-24 w-32 object-cover border shrink-0"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 본문 스크롤 영역 — 마크다운 기호(##, ** 등)를 정리해 실제 보이는 모습으로 미리보기 */}
            <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-5 py-4">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {markdownToPlain(naverPost.naver_content ?? '')}
              </pre>
            </div>

            {/* 액션 버튼 — ①글 복사 →(사진 있으면 ②사진 저장)→ 블로그 열기 순서. 사진 없으면 ②가 곧 블로그 열기 */}
            {(() => {
            const hasNaverImages = !!(naverPost.image_urls?.length || naverPost.image_url)
            return (
            <div className="px-5 py-4 border-t flex flex-col gap-2 shrink-0">
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-12 gap-2"
                  onClick={() => handleNaverCopy(naverPost.naver_content!, naverPost.naver_title ?? undefined)}
                >
                  {copied
                    ? <><CheckCircle2 className="h-4 w-4" />복사됐어요!</>
                    : <><Copy className="h-4 w-4" />① 글 복사</>
                  }
                </Button>
                {hasNaverImages && (
                  <Button
                    variant="outline"
                    className="flex-1 h-12 gap-2"
                    disabled={savingAllImages}
                    onClick={() => handleSaveAllImages(
                      naverPost.image_urls?.length ? naverPost.image_urls : [naverPost.image_url!],
                      naverPost.naver_title || naverPost.title,
                    )}
                  >
                    {savingAllImages
                      ? <><ImageIcon className="h-4 w-4" />저장 중...</>
                      : <><ImageIcon className="h-4 w-4" />② 사진 전부 저장</>
                    }
                  </Button>
                )}
              </div>
              <a
                // /postwrite는 404(네이버가 게시물 경로로 해석) → ?Redirect=Write가 정식 글쓰기 폼(PostWriteForm)으로 302
                href={naverBlogId
                  ? `https://blog.naver.com/${naverBlogId}?Redirect=Write`
                  : 'https://blog.naver.com'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 h-12 rounded-md border border-[#03C75A] text-[#03C75A] text-sm font-medium hover:bg-[#03C75A]/10 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                {hasNaverImages ? '③ 블로그 열기' : '② 블로그 열기'}
              </a>
            </div>
            )
            })()}
          </div>
        </div>
      )}

      {/* 이미지 갤러리 모달 */}
      {galleryPost && (galleryPost.image_urls?.length ?? 0) > 0 && (
        <ImageGalleryModal
          images={galleryPost.image_urls!}
          title={galleryPost.title}
          onClose={() => setGalleryPost(null)}
        />
      )}
    </div>
  )
}
