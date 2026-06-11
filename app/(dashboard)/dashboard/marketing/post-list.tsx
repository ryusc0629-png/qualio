'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { generatePostAction, deletePostAction } from '@/lib/actions/posts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, Plus, ExternalLink, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { PostEditor } from './post-editor'
import { toast } from 'sonner'

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
  const [posts, setPosts] = useState(initialPosts)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [topic, setTopic] = useState('')
  const [imageDescription, setImageDescription] = useState('')
  const [editingPost, setEditingPost] = useState<Post | null>(null)

  const { execute: generatePost, isPending: isGenerating } = useAction(generatePostAction, {
    onSuccess: ({ data }) => {
      if (data?.postContent) {
        toast.success('포스트가 생성됐습니다!')
        setShowGenerator(false)
        setTopic('')
        setImageDescription('')
        // 목록 새로고침을 위해 페이지 리로드
        window.location.reload()
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '포스트 생성에 실패했습니다')
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

  const handleGenerate = () => {
    generatePost({
      topic: topic.trim() || undefined,
      imageDescription: imageDescription.trim() || undefined,
    })
  }

  const postUrl = (slug: string) =>
    businessSlug ? `${appUrl}/biz/${businessSlug}/posts/${slug}` : null

  return (
    <div className="space-y-4">
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
                이미지 설명 (선택) — 사진을 기반으로 내용을 작성합니다
              </Label>
              <Textarea
                placeholder="예: 청소 전후 사진, 욕실 곰팡이 제거 작업 현장, 에어컨 분해 청소 사진..."
                rows={2}
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                disabled={isGenerating}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" />생성 중...</>
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
          아직 포스트가 없습니다. AI로 첫 번째 포스트를 생성해보세요.
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
