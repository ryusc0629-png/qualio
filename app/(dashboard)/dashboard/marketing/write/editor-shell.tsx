'use client'

import { ArrowLeft } from 'lucide-react'
import { PostEditor } from '../post-editor'

// 전체 화면 편집 페이지에서 다룰 포스트 형태
export interface EditablePost {
  id: string
  title: string
  summary: string | null
  published: boolean
  content: string | null
  image_urls: string[] | null
  post_type: string | null
  before_image_urls: string[] | null
  after_image_urls: string[] | null
}

interface EditorShellProps {
  businessId: string
  post: EditablePost
}

// 이미 만들어진 글의 '수정'을 좁은 인라인 패널 대신 전체 화면에서 편집하도록 감싸는 클라이언트 래퍼.
// 저장·취소하면 목록으로 되돌아간다(전체 이동이라 고친 내용이 목록에 바로 반영됨).
export function EditorShell({ businessId, post }: EditorShellProps) {
  const backToList = () => window.location.replace('/dashboard/marketing')

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <button
        type="button"
        onClick={backToList}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />목록으로 돌아가기
      </button>

      <PostEditor
        businessId={businessId}
        post={post}
        onClose={backToList}
        onSaved={backToList}
      />
    </div>
  )
}
