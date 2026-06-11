'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { updateServiceItemAction } from '@/lib/actions/services'
import { createClient } from '@/lib/supabase/client'
import { Pencil, X, ImagePlus, Loader2 } from 'lucide-react'

const CATEGORIES = ['주거 공간', '가전 케어', '특수/시공', '상업 공간', '사무실', '기타'] as const
const UNITS = [
  { value: '정액', label: '정액 (1회 고정가)' },
  { value: '평당', label: '평당 가격' },
  { value: '개', label: '개당 가격' },
  { value: '시간', label: '시간당 가격' },
] as const

const schema = z.object({
  name:       z.string().min(1, '서비스명을 입력해주세요'),
  category:   z.string().optional(),
  base_price: z.string().min(1, '금액을 입력해주세요'),
  unit:       z.string().min(1),
})

type FormInput = z.infer<typeof schema>

interface EditServiceButtonProps {
  service: {
    id: string
    name: string
    category: string | null
    base_price: number
    unit: string
    photos: string[] | null
  }
}

export function EditServiceButton({ service }: EditServiceButtonProps) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<string[]>(service.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       service.name,
      category:   service.category ?? '',
      base_price: String(service.base_price),
      unit:       service.unit,
    },
  })

  const { execute, isPending } = useAction(updateServiceItemAction, {
    onSuccess: () => {
      toast.success('서비스가 수정됐어요!')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '수정에 실패했습니다'),
  })

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (photos.length + files.length > 3) {
      toast.error('사진은 최대 3장까지 등록할 수 있어요')
      return
    }

    setUploading(true)
    const supabase = createClient()
    const newUrls: string[] = []

    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${service.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('service-photos').upload(path, file, { upsert: true })
      if (error) {
        toast.error('사진 업로드에 실패했어요')
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('service-photos').getPublicUrl(path)
      newUrls.push(publicUrl)
    }

    setPhotos((prev) => [...prev, ...newUrls])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = (url: string) => setPhotos((prev) => prev.filter((p) => p !== url))

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="h-8 w-8 p-0">
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>서비스 수정</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit((data) =>
              execute({
                id:         service.id,
                name:       data.name,
                category:   data.category || undefined,
                base_price: Number(data.base_price),
                unit:       data.unit,
                photos,
              })
            )}
            className="space-y-4"
          >
            {/* 서비스명 */}
            <div className="space-y-1">
              <Label>서비스명 *</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* 카테고리 */}
              <div className="space-y-1">
                <Label>카테고리</Label>
                <select {...register('category')} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                  <option value="">선택 안 함</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* 단위 */}
              <div className="space-y-1">
                <Label>단위 *</Label>
                <select {...register('unit')} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                  {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>

            {/* 기본가 */}
            <div className="space-y-1">
              <Label>기본 가격 (원) *</Label>
              <Input type="number" {...register('base_price')} />
              {errors.base_price && <p className="text-xs text-destructive">{errors.base_price.message}</p>}
            </div>

            {/* 사진 업로드 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>견적 페이지에 보여줄 사진 (최대 3장)</Label>
                <span className="text-xs text-muted-foreground">{photos.length}/3</span>
              </div>
              <p className="text-xs text-muted-foreground">
                사진이 있으면 고객 견적 랜딩 페이지에 자동으로 표시됩니다
              </p>

              {/* 사진 미리보기 */}
              <div className="flex gap-2 flex-wrap">
                {photos.map((url) => (
                  <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="서비스 사진" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}

                {/* 추가 버튼 */}
                {photos.length < 3 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-1 hover:border-primary transition-colors disabled:opacity-50"
                  >
                    {uploading
                      ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      : <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    }
                    <span className="text-[10px] text-muted-foreground">사진 추가</span>
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>취소</Button>
              <Button type="submit" size="sm" disabled={isPending || uploading}>
                {isPending ? '저장 중...' : '저장하기'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
