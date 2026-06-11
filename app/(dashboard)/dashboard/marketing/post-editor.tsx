'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { savePostAction } from '@/lib/actions/posts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface PostEditorProps {
  businessId: string
  post?: {
    id: string
    title: string
    summary: string | null
    published: boolean
  }
  onClose: () => void
  onSaved: () => void
}

export function PostEditor({ post, onClose, onSaved }: PostEditorProps) {
  const [title, setTitle] = useState(post?.title ?? '')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState(post?.summary ?? '')
  const [published, setPublished] = useState(post?.published ?? true)

  const { execute: savePost, isPending } = useAction(savePostAction, {
    onSuccess: () => {
      toast.success(post ? '포스트가 수정됐습니다' : '포스트가 저장됐습니다')
      onSaved()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '저장에 실패했습니다')
    },
  })

  const handleSave = () => {
    if (!title.trim()) { toast.error('제목을 입력해주세요'); return }
    if (!content.trim()) { toast.error('내용을 입력해주세요'); return }

    savePost({
      id: post?.id,
      title,
      content,
      summary: summary || undefined,
      published,
    })
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm">{post ? '포스트 수정' : '새 포스트 작성'}</h3>

      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">제목</Label>
          <Input
            placeholder="포스트 제목 입력..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">요약 (선택)</Label>
          <Input
            placeholder="검색 결과에 노출될 요약 (130자 이내)..."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={isPending}
            maxLength={150}
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">본문</Label>
          <Textarea
            placeholder="포스트 본문을 작성하세요..."
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isPending}
            className="font-mono text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={published}
            onCheckedChange={setPublished}
            disabled={isPending}
          />
          <Label className="text-sm">{published ? '공개' : '비공개'}</Label>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isPending} className="gap-2">
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />저장 중...</>
          ) : (
            <><Save className="h-4 w-4" />저장</>
          )}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          취소
        </Button>
      </div>
    </div>
  )
}
