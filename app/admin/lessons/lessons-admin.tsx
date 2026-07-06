'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  createLessonAction,
  updateLessonAction,
  deleteLessonAction,
} from '@/lib/actions/lessons'
import type { Lesson } from '@/lib/types/lesson'
import { Plus, Pencil, Trash2, Lock, Eye, EyeOff } from 'lucide-react'

// 강의 추가/수정 폼 (생성·편집 공용)
function LessonForm({
  lesson,
  defaultOrder,
  onCancel,
}: {
  lesson?: Lesson
  defaultOrder?: number
  onCancel?: () => void
}) {
  const isEdit = !!lesson
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [vimeoId, setVimeoId] = useState(lesson?.vimeo_id ?? '')
  const [duration, setDuration] = useState(lesson?.duration_label ?? '')
  const [sortOrder, setSortOrder] = useState(String(lesson?.sort_order ?? defaultOrder ?? 0))
  const [description, setDescription] = useState(lesson?.description ?? '')
  const [isFree, setIsFree] = useState(lesson?.is_free ?? false)
  const [published, setPublished] = useState(lesson?.published ?? false)

  const createAct = useAction(createLessonAction, {
    onSuccess: () => {
      toast.success('강의를 추가했어요!')
      window.location.reload()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const updateAct = useAction(updateLessonAction, {
    onSuccess: () => {
      toast.success('강의를 수정했어요!')
      window.location.reload()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const isPending = createAct.isPending || updateAct.isPending

  function submit() {
    if (!title.trim()) {
      toast.error('제목을 입력해주세요')
      return
    }
    if (!vimeoId.trim()) {
      toast.error('Vimeo 주소나 ID를 입력해주세요')
      return
    }
    const payload = {
      title: title.trim(),
      vimeo_id: vimeoId.trim(),
      description: description.trim() || undefined,
      duration_label: duration.trim() || undefined,
      sort_order: Number(sortOrder) || 0,
      is_free: isFree,
      published,
    }
    if (isEdit && lesson) updateAct.execute({ ...payload, id: lesson.id })
    else createAct.execute(payload)
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="space-y-1.5">
        <Label>제목</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 1강. 정기 거래처 뚫는 법"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Vimeo 영상 주소 또는 ID</Label>
        <Input
          value={vimeoId}
          onChange={(e) => setVimeoId(e.target.value)}
          placeholder="https://vimeo.com/76979871 또는 76979871"
        />
        <p className="text-[11px] text-muted-foreground">
          Vimeo 영상 주소를 그대로 붙여넣어도 돼요. 숫자 ID만 자동으로 뽑아냅니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>영상 길이 (표시용)</Label>
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="10분" />
        </div>
        <div className="space-y-1.5">
          <Label>순서 (작을수록 위)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>설명 (선택)</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이 강의에서 배우는 내용을 적어주세요"
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2">
          <Switch checked={isFree} onCheckedChange={setIsFree} />
          <span className="text-sm">무료 공개 (비회원도 시청)</span>
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={published} onCheckedChange={setPublished} />
          <span className="text-sm">노출 (공개)</span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={submit} disabled={isPending} className="h-11">
          {isPending ? '저장 중...' : isEdit ? '수정 저장하기' : '강의 추가하기'}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isPending} className="h-11">
            취소
          </Button>
        )}
      </div>
    </div>
  )
}

// 강의 한 줄 (목록)
function LessonRow({ lesson, index }: { lesson: Lesson; index: number }) {
  const [editing, setEditing] = useState(false)

  const deleteAct = useAction(deleteLessonAction, {
    onSuccess: () => {
      toast.success('강의를 삭제했어요')
      window.location.reload()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  function onDelete() {
    if (!window.confirm(`"${lesson.title}" 강의를 삭제할까요? 되돌릴 수 없어요.`)) return
    deleteAct.execute({ id: lesson.id })
  }

  if (editing) {
    return <LessonForm lesson={lesson} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{lesson.title}</p>
          {lesson.is_free && (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              무료
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>순서 {lesson.sort_order}</span>
          <span>·</span>
          <span>Vimeo {lesson.vimeo_id}</span>
          {lesson.duration_label && (
            <>
              <span>·</span>
              <span>{lesson.duration_label}</span>
            </>
          )}
          <span>·</span>
          {lesson.published ? (
            <span className="inline-flex items-center gap-0.5 text-emerald-600">
              <Eye className="h-3 w-3" /> 공개
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              <EyeOff className="h-3 w-3" /> 초안
            </span>
          )}
          {!lesson.is_free && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <Lock className="h-3 w-3" /> 회원
              </span>
            </>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDelete}
        disabled={deleteAct.isPending}
        className="text-red-600 hover:text-red-700"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function LessonsAdmin({ lessons }: { lessons: Lesson[] }) {
  const [adding, setAdding] = useState(false)
  const nextOrder = lessons.length > 0 ? Math.max(...lessons.map((l) => l.sort_order)) + 1 : 0

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">강의 목록 ({lessons.length})</h2>
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" />새 강의 추가
            </Button>
          )}
        </div>

        {adding && (
          <div className="mb-4">
            <LessonForm defaultOrder={nextOrder} onCancel={() => setAdding(false)} />
          </div>
        )}

        {lessons.length === 0 && !adding ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            아직 강의가 없어요. “새 강의 추가”를 눌러 첫 강의를 올려보세요.
          </div>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson, i) => (
              <LessonRow key={lesson.id} lesson={lesson} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
