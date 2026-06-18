'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Heading2, Bold, List } from 'lucide-react'
import { markdownToHtml, htmlToMarkdown } from '@/lib/markdown'

interface RichTextEditorProps {
  value: string // 마크다운
  onChange: (markdown: string) => void
  disabled?: boolean
}

// 청소 사장님용 쉬운 서식 편집기 — ## ** 같은 기호 없이 워드처럼 편집
export function RichTextEditor({ value, onChange, disabled }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: markdownToHtml(value),
    editable: !disabled,
    immediatelyRender: false, // Next SSR 하이드레이션 경고 방지
    editorProps: {
      attributes: {
        class: 'rte-content min-h-[240px] px-3 py-2.5 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(htmlToMarkdown(editor.getHTML()))
    },
  })

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [disabled, editor])

  if (!editor) {
    return <div className="min-h-[280px] rounded-md border bg-muted/30 animate-pulse" />
  }

  const toolbarBtn = (active: boolean) =>
    `h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
      active ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className="rounded-md border overflow-hidden bg-white">
      {/* 서식 도구 모음 */}
      <div className="flex items-center gap-1 border-b bg-slate-50 px-2 py-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={toolbarBtn(editor.isActive('heading', { level: 2 }))}
          title="큰 제목"
        >
          <Heading2 className="h-3.5 w-3.5" />제목
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={toolbarBtn(editor.isActive('bold'))}
          title="굵게"
        >
          <Bold className="h-3.5 w-3.5" />굵게
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={toolbarBtn(editor.isActive('bulletList'))}
          title="목록"
        >
          <List className="h-3.5 w-3.5" />목록
        </button>
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}
