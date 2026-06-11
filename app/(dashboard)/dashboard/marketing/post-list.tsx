'use client'

import { useState, useRef, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { generatePostAction, deletePostAction, getTopicSuggestionsAction } from '@/lib/actions/posts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, Plus, ExternalLink, Trash2, Eye, EyeOff, Loader2, ImagePlus, X, TrendingUp, ChevronRight, CheckCircle2, RefreshCw } from 'lucide-react'
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
  completedTopics: string[]
}

// 이번 주 캐시 키 — 업체별, 주별 고유
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
    if (cache.weekKey !== getWeekKey(businessId)) return null  // 주가 바뀌면 무효
    return cache
  } catch {
    return null
  }
}

function saveCache(businessId: string, suggestions: TopicSuggestion[], completedTopics: string[]) {
  try {
    const cache: SuggestionCache = {
      weekKey: getWeekKey(businessId),
      suggestions,
      completedTopics,
    }
    localStorage.setItem('qualio_topic_cache', JSON.stringify(cache))
  } catch {
    // localStorage 저장 실패는 조용히 무시
  }
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
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'

export function PostList({ posts: initialPosts, businessSlug, businessId }: PostListProps) {
  const [posts] = useState(initialPosts)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [topic, setTopic] = useState('')
  // 여러 장 지원 — 첫 번째 사진을 AI 분석 + 대표 이미지로 사용
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 이번 달 주제 추천
  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(null)
  // 개별 카드에서 업로드 중인 topic 추적 (ref: stale closure 방지)
  const [uploadingTopic, setUploadingTopic] = useState<string | null>(null)
  const uploadingTopicRef = useRef<string | null>(null)
  // 이미 업로드 완료된 topic 목록
  const [completedTopics, setCompletedTopics] = useState<string[]>([])

  // 주제 추천 액션 — 마운트 시 자동 호출
  const { execute: fetchSuggestions, isPending: isLoadingSuggestions } = useAction(
    getTopicSuggestionsAction,
    {
      onSuccess: ({ data }) => {
        if (data?.suggestions) {
          setSuggestions(data.suggestions)
          saveCache(businessId, data.suggestions, [])
        }
      },
      onError: () => {
        // 조용히 실패 — 추천이 없어도 사용에 지장 없음
      },
    }
  )

  // 마운트 시: 캐시 우선 — 없을 때만 AI 호출
  useEffect(() => {
    const cached = loadCache(businessId)
    if (cached) {
      setSuggestions(cached.suggestions)
      setCompletedTopics(cached.completedTopics)
    } else {
      fetchSuggestions({})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 새로 기획하기 — 캐시 무효화 후 재호출
  const handleRefreshSuggestions = () => {
    try { localStorage.removeItem('qualio_topic_cache') } catch { /* 무시 */ }
    setSuggestions(null)
    setCompletedTopics([])
    fetchSuggestions({})
  }

  const { execute: generatePost, isPending: isGenerating } = useAction(generatePostAction, {
    onSuccess: ({ data }) => {
      if (data?.postContent) {
        toast.success('포스트가 생성됐습니다!')
        // 추천 카드에서 올린 경우 → 완료 표시 + 캐시 업데이트
        if (uploadingTopicRef.current) {
          setCompletedTopics((prev) => {
            const next = [...prev, uploadingTopicRef.current!]
            // 완료 목록도 캐시에 반영 (페이지 리로드 후에도 유지)
            setSuggestions((s) => {
              if (s) saveCache(businessId, s, next)
              return s
            })
            return next
          })
        }
        uploadingTopicRef.current = null
        setUploadingTopic(null)
        setShowGenerator(false)
        setTopic('')
        setUploadedUrls([])
        window.location.reload()
      }
    },
    onError: ({ error }) => {
      uploadingTopicRef.current = null
      setUploadingTopic(null)
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

    // 모든 파일 병렬 업로드
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

    // 같은 파일 재선택 가능하도록 초기화
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (url: string) => {
    setUploadedUrls((prev) => prev.filter((u) => u !== url))
  }

  const handleGenerate = () => {
    generatePost({
      topic: topic.trim() || undefined,
      imageUrl: uploadedUrls[0], // 첫 번째 사진을 AI가 분석
    })
  }

  // 추천 주제 카드에서 바로 업로드 (topic 300자 초과 방지)
  const handleSuggestionUpload = (suggestion: TopicSuggestion) => {
    const safeTopic = suggestion.topic.slice(0, 300)
    uploadingTopicRef.current = safeTopic
    setUploadingTopic(safeTopic)
    generatePost({ topic: safeTopic })
  }

  const postUrl = (slug: string) =>
    businessSlug ? `${appUrl}/biz/${businessSlug}/posts/${slug}` : null

  const isUploading = uploadingCount > 0

  const currentMonth = new Date().getMonth() + 1

  return (
    <div className="space-y-4">

      {/* ── 이번 달 인기 주제 추천 ── */}
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
            title="이번 주 주제 새로 기획하기"
          >
            <RefreshCw className={`h-3 w-3 ${isLoadingSuggestions ? 'animate-spin' : ''}`} />
            새로 기획하기
          </button>
        </div>

        {/* 로딩 중 */}
        {isLoadingSuggestions && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI가 이번 달 인기 주제를 분석 중이에요...
          </div>
        )}

        {/* 추천 카드 목록 */}
        {suggestions && suggestions.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {suggestions.map((s) => {
              const isThisUploading = isGenerating && uploadingTopic === s.topic
              const isDone = completedTopics.includes(s.topic)
              return (
                <div
                  key={s.topic}
                  className={`rounded-lg border p-3.5 flex flex-col gap-2 transition-colors ${isDone ? 'bg-emerald-50 border-emerald-200' : 'bg-white hover:border-primary/40'}`}
                >
                  <div className="flex-1">
                    {isDone && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-xs text-emerald-600 font-semibold">업로드 완료</span>
                      </div>
                    )}
                    <p className="font-semibold text-xs leading-snug line-clamp-2">{s.title}</p>
                    <p className="text-xs text-primary mt-1">{s.reason}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isDone ? 'ghost' : 'outline'}
                    className={`w-full gap-1.5 h-8 text-xs mt-1 ${isDone ? 'text-muted-foreground hover:text-foreground' : ''}`}
                    onClick={() => handleSuggestionUpload(s)}
                    disabled={isGenerating}
                  >
                    {isThisUploading ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />작성 중...</>
                    ) : isDone ? (
                      <><Sparkles className="h-3 w-3" />다시 올리기</>
                    ) : (
                      <><Sparkles className="h-3 w-3" />이 글 올리기 <ChevronRight className="h-3 w-3" /></>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => { setShowGenerator(!showGenerator); setShowEditor(false) }}
          className="gap-2"
        >
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

              {/* 업로드된 사진 썸네일 그리드 */}
              {uploadedUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {uploadedUrls.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="업로드된 사진"
                        className="h-20 w-20 rounded-lg object-cover border"
                      />
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

              {/* 사진 올리기 버튼 */}
              <label className={`flex items-center gap-2 w-fit cursor-pointer rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-accent transition-colors ${isUploading || isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                {isUploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{uploadingCount}장 올리는 중...</>
                ) : (
                  <><ImagePlus className="h-4 w-4" />{uploadedUrls.length > 0 ? '사진 더 추가하기' : '사진 올리기'}</>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"           /* 아이폰 HEIC 포함 모든 이미지 허용 */
                  multiple                   /* 여러 장 동시 선택 */
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isUploading || isGenerating}
                />
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={isGenerating || isUploading} className="gap-2">
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" />AI가 작성 중이에요...</>
              ) : (
                <><Sparkles className="h-4 w-4" />생성하기</>
              )}
            </Button>
            <Button variant="ghost" onClick={() => setShowGenerator(false)} disabled={isGenerating}>
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 직접 작성 패널 */}
      {showEditor && !editingPost && (
        <PostEditor
          businessId={businessId}
          onClose={() => setShowEditor(false)}
          onSaved={() => { setShowEditor(false); window.location.reload() }}
        />
      )}

      {/* 수정 패널 */}
      {editingPost && (
        <PostEditor
          businessId={businessId}
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => { setEditingPost(null); window.location.reload() }}
        />
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
              <div
                key={post.id}
                className="rounded-lg border bg-card p-4 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{post.title}</p>
                    {post.ai_generated && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <Sparkles className="h-3 w-3 mr-1" />AI
                      </Badge>
                    )}
                    {!post.published && (
                      <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                        비공개
                      </Badge>
                    )}
                  </div>
                  {post.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{post.summary}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(post.published_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingPost(post)}
                  >
                    {post.published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={isDeleting}
                    onClick={() => {
                      if (confirm('포스트를 삭제할까요?')) {
                        deletePost({ id: post.id })
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 랜딩 페이지 바로가기 */}
      {businessSlug && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          랜딩 페이지:{' '}
          <a
            href={`${appUrl}/biz/${businessSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {appUrl}/biz/{businessSlug}
          </a>
        </div>
      )}
    </div>
  )
}
