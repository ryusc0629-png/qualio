'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { savePostAction, generatePostFromNotesAction } from '@/lib/actions/posts'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, ImagePlus, X, GripVertical, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { RichTextEditor } from './rich-text-editor'

interface PostEditorProps {
  businessId: string
  post?: {
    id: string
    title: string
    summary: string | null
    published: boolean
    content?: string | null
    image_urls?: string[] | null
    post_type?: string | null
    before_image_urls?: string[] | null
    after_image_urls?: string[] | null
  }
  onClose: () => void
  onSaved: () => void
}

// 본문 앞의 JSON 메타 블록(keyPoints/faqs) — 공개 페이지에선 숨겨지므로 편집창에서도 분리
const META_BLOCK_RE = /^```json\n[\s\S]+?\n```\n/

export function PostEditor({ businessId, post, onClose, onSaved }: PostEditorProps) {
  const rawContent = post?.content ?? ''
  const metaMatch = rawContent.match(META_BLOCK_RE)
  const metaBlock = metaMatch ? metaMatch[0] : ''
  const bodyOnly = metaMatch ? rawContent.slice(metaMatch[0].length) : rawContent

  const isPortfolio = post?.post_type === 'portfolio'

  const [title, setTitle] = useState(post?.title ?? '')
  const [content, setContent] = useState(bodyOnly)
  const [summary, setSummary] = useState(post?.summary ?? '')
  // 현장 메모(신규 작성 시 사진+메모로 초안 자동 생성)
  const [notes, setNotes] = useState('')
  const [published, setPublished] = useState(post?.published ?? true)
  const [imageUrls, setImageUrls] = useState<string[]>(post?.image_urls ?? [])
  const [beforeImageUrls, setBeforeImageUrls] = useState<string[]>(post?.before_image_urls ?? [])
  const [afterImageUrls, setAfterImageUrls] = useState<string[]>(post?.after_image_urls ?? [])
  const [uploading, setUploading] = useState(false)
  const [uploadingBefore, setUploadingBefore] = useState(false)
  const [uploadingAfter, setUploadingAfter] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const beforeFileInputRef = useRef<HTMLInputElement>(null)
  const afterFileInputRef = useRef<HTMLInputElement>(null)
  // 드래그 중인 이미지 인덱스
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const { execute: savePost, isPending } = useAction(savePostAction, {
    onSuccess: () => {
      toast.success(post ? '포스트가 수정됐습니다' : '포스트가 저장됐습니다')
      onSaved()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '저장에 실패했습니다')
    },
  })

  // 현장 메모 + 사진 → 초안 자동 작성 (저장은 안 함, 아래 편집칸을 채워줌)
  const { execute: generateFromNotes, isPending: isGenerating } = useAction(generatePostFromNotesAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      setTitle(data.title)
      setSummary(data.summary)
      setContent(data.content)
      toast.success('글 초안이 만들어졌어요. 내용을 확인하고 저장하세요')
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '글을 만들지 못했어요. 잠시 후 다시 눌러주세요')
    },
  })

  const handleGenerateFromNotes = () => {
    if (!notes.trim()) { toast.error('현장 메모를 입력해주세요'); return }
    generateFromNotes({ notes, imageUrls: imageUrls.length > 0 ? imageUrls : undefined })
  }

  const handleSave = () => {
    if (!title.trim()) { toast.error('제목을 입력해주세요'); return }
    if (!content.trim()) { toast.error('내용을 입력해주세요'); return }

    savePost({
      id: post?.id,
      title,
      content: metaBlock + content,
      summary: summary || undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      beforeImageUrls: isPortfolio ? beforeImageUrls : undefined,
      afterImageUrls: isPortfolio ? afterImageUrls : undefined,
      published,
    })
  }

  // Supabase Storage에 이미지 업로드
  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const maxFiles = 10 - imageUrls.length
    if (maxFiles <= 0) {
      toast.error('이미지는 최대 10장까지 추가할 수 있어요')
      return
    }

    const toUpload = Array.from(files).slice(0, maxFiles)
    setUploading(true)

    const supabase = createClient()
    const uploaded: string[] = []

    for (const file of toUpload) {
      // 5MB 제한
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name}은 5MB를 초과해서 건너뛰었어요`)
        continue
      }

      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error } = await supabase.storage.from('post-images').upload(path, file, { upsert: true })
      if (error) {
        console.error('[PostEditor] 이미지 업로드 오류:', error)
        toast.error('이미지 업로드에 실패했어요')
        continue
      }

      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      uploaded.push(publicUrl)
    }

    if (uploaded.length > 0) {
      setImageUrls((prev) => [...prev, ...uploaded])
      toast.success(`사진 ${uploaded.length}장이 추가됐어요`)
    }

    setUploading(false)
    // 같은 파일 재선택 가능하도록 초기화
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadImages = async (
    files: FileList | null,
    current: string[],
    setUrls: React.Dispatch<React.SetStateAction<string[]>>,
    setUpl: React.Dispatch<React.SetStateAction<boolean>>,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    if (!files || files.length === 0) return
    const maxFiles = 5 - current.length
    if (maxFiles <= 0) { toast.error('사진은 최대 5장까지 추가할 수 있어요'); return }
    const toUpload = Array.from(files).slice(0, maxFiles)
    setUpl(true)
    const supabase = createClient()
    const uploaded: string[] = []
    for (const file of toUpload) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}은 5MB를 초과해서 건너뛰었어요`); continue }
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('post-images').upload(path, file, { upsert: true })
      if (error) { console.error('[PostEditor] 업로드 오류:', error); toast.error('업로드에 실패했어요'); continue }
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      uploaded.push(publicUrl)
    }
    if (uploaded.length > 0) { setUrls((prev) => [...prev, ...uploaded]); toast.success(`사진 ${uploaded.length}장이 추가됐어요`) }
    setUpl(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // 드래그 앤 드롭으로 이미지 순서 변경
  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    setImageUrls((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm">{post ? '포스트 수정' : '새 포스트 작성'}</h3>

      {/* 현장 메모로 빠르게 만들기 — 신규 작성(일반 포스트)에서만 노출 */}
      {!post && !isPortfolio && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div>
            <h4 className="text-sm font-semibold">현장 메모로 빠르게 만들기</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              오늘 한 작업을 편하게 적어주세요. 아래 &lsquo;사진&rsquo; 칸에 현장 사진을 먼저 올리면, 사진까지 보고 읽기 좋은 글로 만들어 드려요. (사진 없이 메모만으로도 됩니다)
            </p>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isGenerating || isPending}
            rows={4}
            placeholder="예: 오늘 삼산동 OO상가 바닥 왁스 작업. 기름때가 심해서 두 번 밀었고 미끄럼방지까지 코팅함. 사장님이 반짝인다고 좋아하심."
            className="w-full rounded-md border bg-white px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button
            type="button"
            onClick={handleGenerateFromNotes}
            disabled={isGenerating || isPending || !notes.trim()}
            className="gap-2"
          >
            {isGenerating
              ? <><Loader2 className="h-4 w-4 animate-spin" />전문가 데이터로 작성 중이에요...</>
              : <><Sparkles className="h-4 w-4" />이 내용으로 글 만들기</>}
          </Button>
          <p className="text-xs text-muted-foreground">
            만든 글은 아래에서 바로 고칠 수 있어요. 마음에 들면 저장하세요.
          </p>
        </div>
      )}

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
          <RichTextEditor value={content} onChange={setContent} disabled={isPending} />
          <p className="text-xs text-muted-foreground mt-1.5">
            위 버튼으로 제목·굵게·목록을 넣을 수 있어요. 저장하면 웹사이트에 똑같이 반영됩니다.
          </p>
        </div>

        {/* 이미지 업로드 영역 */}
        {isPortfolio ? (
          /* ── 포트폴리오: 시공 전/후 사진 구분 ── */
          <div className="space-y-3">
            {(['before', 'after'] as const).map((side) => {
              const urls = side === 'before' ? beforeImageUrls : afterImageUrls
              const setUrls = side === 'before' ? setBeforeImageUrls : setAfterImageUrls
              const isUploading = side === 'before' ? uploadingBefore : uploadingAfter
              const setUpl = side === 'before' ? setUploadingBefore : setUploadingAfter
              const inputRef = side === 'before' ? beforeFileInputRef : afterFileInputRef
              const label = side === 'before' ? '시공 전 사진' : '시공 후 사진'
              const colorClass = side === 'before' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'

              return (
                <div key={side}>
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5 block">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${colorClass}`}>{label}</span>
                    <span>({urls.length}/5)</span>
                  </Label>
                  {urls.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
                      {urls.map((url, i) => (
                        <div key={`${side}-${i}`} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`${label} ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                          >
                            <X className="h-3.5 w-3.5 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadImages(e.target.files, urls, setUrls, setUpl, inputRef)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending || isUploading || urls.length >= 5}
                    onClick={() => inputRef.current?.click()}
                    className="gap-2"
                  >
                    {isUploading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />업로드 중...</>
                      : <><ImagePlus className="h-4 w-4" />{label} 추가</>}
                  </Button>
                </div>
              )
            })}
            <p className="text-xs text-muted-foreground">시공 후 사진이 카드 썸네일과 Before/After 비교에 사용돼요</p>
          </div>
        ) : (
          /* ── 일반 포스트: 기존 이미지 업로드 ── */
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              사진 ({imageUrls.length}/10)
            </Label>

            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                {imageUrls.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className={`relative group aspect-square rounded-lg overflow-hidden border bg-muted cursor-grab active:cursor-grabbing ${
                      dragOverIndex === i ? 'ring-2 ring-primary' : ''
                    } ${dragIndex === i ? 'opacity-50' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`사진 ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-black/50 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="h-3.5 w-3.5 text-white" />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                    >
                      <X className="h-3.5 w-3.5 text-white" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                        대표
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleImageUpload(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || uploading || imageUrls.length >= 10}
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />업로드 중...</>
              ) : (
                <><ImagePlus className="h-4 w-4" />사진 추가</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              드래그로 순서를 변경할 수 있어요. 첫 번째 사진이 대표 이미지로 사용됩니다.
            </p>
          </div>
        )}

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
        <Button onClick={handleSave} disabled={isPending || uploading} className="gap-2">
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
