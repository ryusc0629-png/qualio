'use client'

import { useState, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { savePostAction } from '@/lib/actions/posts'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, ImagePlus, X, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { RichTextEditor } from './rich-text-editor'
import { buildUploadPath } from '@/lib/storage/upload-path'
import { REPORT_PHOTO_MAX } from '@/lib/config/photos'

// 이 편집기는 '이미 만들어진 글을 고치는' 용도만 남았다.
// 백지에서 새로 쓰거나 메모로 초안을 뽑는 진입점은 없앴다 — 퀄리오가 대신 만들어 주고
// 사장님은 확인·수정만 하면 되게, 손으로 할 일을 늘리지 않기 위해서다.
interface PostEditorProps {
  businessId: string
  post: {
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

// 순서를 바꿀 수 있는 사진 칸
type PhotoList = 'main' | 'before' | 'after'

export function PostEditor({ businessId, post, onClose, onSaved }: PostEditorProps) {
  const rawContent = post.content ?? ''
  const metaMatch = rawContent.match(META_BLOCK_RE)
  const metaBlock = metaMatch ? metaMatch[0] : ''
  const bodyOnly = metaMatch ? rawContent.slice(metaMatch[0].length) : rawContent

  const isPortfolio = post.post_type === 'portfolio'

  const [title, setTitle] = useState(post.title)
  const [content, setContent] = useState(bodyOnly)
  const [summary, setSummary] = useState(post.summary ?? '')
  const [published, setPublished] = useState(post.published)
  const [imageUrls, setImageUrls] = useState<string[]>(post.image_urls ?? [])
  const [beforeImageUrls, setBeforeImageUrls] = useState<string[]>(post.before_image_urls ?? [])
  const [afterImageUrls, setAfterImageUrls] = useState<string[]>(post.after_image_urls ?? [])
  const [uploading, setUploading] = useState(false)
  const [uploadingBefore, setUploadingBefore] = useState(false)
  const [uploadingAfter, setUploadingAfter] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const beforeFileInputRef = useRef<HTMLInputElement>(null)
  const afterFileInputRef = useRef<HTMLInputElement>(null)
  // 드래그 중인 이미지 — 사진 칸이 셋(본문·시공 전·시공 후)이라 어느 칸인지까지 같이 들고 있어야 한다
  const [dragFrom, setDragFrom] = useState<{ list: PhotoList; index: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ list: PhotoList; index: number } | null>(null)

  const { execute: savePost, isPending } = useAction(savePostAction, {
    onSuccess: () => {
      toast.success('글이 수정됐어요')
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
      id: post.id,
      title,
      content: metaBlock + content,
      summary: summary || undefined,
      // 시공사례는 화면에 보이는 전·후 사진이 곧 전체 사진 목록이다.
      // 예전엔 보고서에서 받아온 옛 목록을 손도 못 댄 채 그대로 되돌려보내서,
      // 편집창에서 지운 사진이 대표 이미지로 계속 되살아났다.
      // 일반 글은 사진을 다 지운 경우에도 빈 목록을 보내야 마지막 한 장이 지워진다.
      imageUrls: isPortfolio
        ? [...beforeImageUrls, ...afterImageUrls]
        : imageUrls.length > 0 || (post.image_urls?.length ?? 0) > 0
          ? imageUrls
          : undefined,
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

      const path = buildUploadPath(businessId, file.name)

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
    // 상한은 작업 보고서와 같은 값 — 보고서 사진이 그대로 넘어오므로 여기가 더 작으면 잘려 보인다
    const maxFiles = REPORT_PHOTO_MAX - current.length
    if (maxFiles <= 0) { toast.error(`사진은 최대 ${REPORT_PHOTO_MAX}장까지 추가할 수 있어요`); return }
    const toUpload = Array.from(files).slice(0, maxFiles)
    setUpl(true)
    const supabase = createClient()
    const uploaded: string[] = []
    for (const file of toUpload) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}은 5MB를 초과해서 건너뛰었어요`); continue }
      const path = buildUploadPath(businessId, file.name)
      const { error } = await supabase.storage.from('post-images').upload(path, file, { upsert: true })
      if (error) { console.error('[PostEditor] 업로드 오류:', error); toast.error('업로드에 실패했어요'); continue }
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      uploaded.push(publicUrl)
    }
    if (uploaded.length > 0) { setUrls((prev) => [...prev, ...uploaded]); toast.success(`사진 ${uploaded.length}장이 추가됐어요`) }
    setUpl(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // 드래그 앤 드롭으로 사진 순서 변경
  const setterFor = (list: PhotoList) =>
    list === 'before' ? setBeforeImageUrls : list === 'after' ? setAfterImageUrls : setImageUrls

  const clearDrag = () => {
    setDragFrom(null)
    setDragOver(null)
  }

  const handleDragStart = (list: PhotoList, index: number) => {
    setDragFrom({ list, index })
  }

  const handleDragOver = (e: React.DragEvent, list: PhotoList, index: number) => {
    e.preventDefault()
    setDragOver({ list, index })
  }

  const handleDrop = (list: PhotoList, index: number) => {
    // 다른 칸으로는 옮기지 않는다 — 시공 전 사진이 후 사진 자리에 끼면 비교가 뒤집힌다
    if (!dragFrom || dragFrom.list !== list || dragFrom.index === index) {
      clearDrag()
      return
    }
    const from = dragFrom.index
    setterFor(list)((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(index, 0, moved)
      return next
    })
    clearDrag()
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm">글 고치기</h3>

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
            위 버튼으로 제목·굵게·목록을 넣을 수 있어요. 저장하면 홈페이지에 똑같이 반영됩니다.
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
                    <span>({urls.length}/{REPORT_PHOTO_MAX})</span>
                  </Label>
                  {urls.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
                      {urls.map((url, i) => (
                        <div
                          key={`${side}-${url}-${i}`}
                          className={`relative group aspect-square rounded-lg overflow-hidden border bg-muted cursor-grab active:cursor-grabbing ${
                            dragOver?.list === side && dragOver.index === i ? 'ring-2 ring-primary' : ''
                          } ${dragFrom?.list === side && dragFrom.index === i ? 'opacity-50' : ''}`}
                          draggable
                          onDragStart={() => handleDragStart(side, i)}
                          onDragOver={(e) => handleDragOver(e, side, i)}
                          onDrop={() => handleDrop(side, i)}
                          onDragEnd={clearDrag}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`${label} ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute top-1 left-1 bg-black/50 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <GripVertical className="h-3.5 w-3.5 text-white" />
                          </div>
                          <button
                            type="button"
                            onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}
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
                    disabled={isPending || isUploading || urls.length >= REPORT_PHOTO_MAX}
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
            <p className="text-xs text-muted-foreground">
              드래그로 순서를 바꿀 수 있어요. 각 줄의 첫 번째(대표) 사진이 시공 전·후 비교에 쓰이고, 시공 후 대표 사진이 목록 카드에 보여요.
            </p>
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
                      dragOver?.list === 'main' && dragOver.index === i ? 'ring-2 ring-primary' : ''
                    } ${dragFrom?.list === 'main' && dragFrom.index === i ? 'opacity-50' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart('main', i)}
                    onDragOver={(e) => handleDragOver(e, 'main', i)}
                    onDrop={() => handleDrop('main', i)}
                    onDragEnd={clearDrag}
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
