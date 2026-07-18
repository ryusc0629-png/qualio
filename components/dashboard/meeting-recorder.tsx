'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createLeadActivityAction } from '@/lib/actions/crm'
import { Mic, Square, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

const MAX_SECONDS = 25 * 60 // 25분 (OpenAI 처리 한도)

type Phase = 'idle' | 'recording' | 'processing' | 'review'

// 초 → mm:ss 표시
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function MeetingRecorder({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [summary, setSummary] = useState('')
  const [transcript, setTranscript] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10))

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const { execute: save, isPending: saving } = useAction(createLeadActivityAction, {
    onSuccess: () => {
      toast.success('미팅 기록을 저장했어요!')
      reset()
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  function reset() {
    setPhase('idle')
    setSeconds(0)
    setSummary('')
    setTranscript('')
    setShowTranscript(false)
  }

  // 녹음 시작
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 브라우저별 지원 포맷 선택 (iOS 사파리는 mp4)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = handleStop
      recorder.start()
      mediaRecorderRef.current = recorder

      setPhase('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          // 25분 도달 시 자동 종료
          if (prev + 1 >= MAX_SECONDS) {
            stopRecording()
            toast.info('25분이 넘어 녹음을 자동으로 마쳤어요')
          }
          return prev + 1
        })
      }, 1000)
    } catch (error) {
      console.error('[MeetingRecorder] 마이크 접근 실패:', error)
      toast.error('마이크를 쓸 수 없어요. 브라우저의 마이크 권한을 허용해주세요')
    }
  }

  // 녹음 중지 → onstop 트리거
  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }

  // 녹음 종료 후: 서버로 보내 받아쓰기 + 요약
  async function handleStop() {
    setPhase('processing')

    const mime = mediaRecorderRef.current?.mimeType ?? 'audio/webm'
    const ext = mime.includes('mp4') ? 'mp4' : 'webm'
    const blob = new Blob(chunksRef.current, { type: mime })
    const file = new File([blob], `meeting.${ext}`, { type: mime })

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/meeting-transcribe', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '정리하지 못했어요')

      setTranscript(data.transcript ?? '')
      setSummary(data.summary ?? '')
      setPhase('review')
    } catch (error) {
      console.error('[MeetingRecorder] 처리 실패:', error)
      toast.error(error instanceof Error ? error.message : '정리하지 못했어요. 다시 시도해주세요')
      setPhase('idle')
    }
  }

  function handleSave() {
    save({
      leadId,
      type: 'meeting',
      content: summary,
      transcript,
      activity_at: new Date(activityDate).toISOString(),
    })
  }

  // ── 단계별 화면 ──────────────────────────────────────────

  // 대기: 녹음 시작 버튼
  if (phase === 'idle') {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={startRecording}
      >
        <Mic className="h-3.5 w-3.5 mr-1" />
        미팅 녹음 정리
      </Button>
    )
  }

  // 녹음 중
  if (phase === 'recording') {
    return (
      <div className="bg-white rounded-xl border p-6 space-y-5 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-sm font-medium text-red-600">녹음 중이에요</span>
        </div>

        <div className="text-4xl font-bold tabular-nums">{formatTime(seconds)}</div>
        <p className="text-xs text-muted-foreground">
          최대 25분까지 녹음할 수 있어요
        </p>

        <Button
          size="lg"
          className="w-full h-14 text-base bg-red-600 hover:bg-red-700"
          onClick={stopRecording}
        >
          <Square className="h-5 w-5 mr-2 fill-current" />
          녹음 끝내고 정리하기
        </Button>
      </div>
    )
  }

  // 처리 중
  if (phase === 'processing') {
    return (
      <div className="bg-white rounded-xl border p-8 space-y-3 text-center">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
        <p className="text-sm font-medium">미팅 내용을 정리하고 있어요...</p>
        <p className="text-xs text-muted-foreground">
          녹음 길이에 따라 1~2분 걸릴 수 있어요. 잠시만 기다려주세요
        </p>
      </div>
    )
  }

  // 검토 & 저장
  return (
    <div className="bg-white rounded-xl border p-4 space-y-4">
      <div>
        <Label className="text-xs">미팅 날짜</Label>
        <Input
          type="date"
          value={activityDate}
          onChange={(e) => setActivityDate(e.target.value)}
          className="mt-1 h-9"
        />
      </div>

      <div>
        <Label className="text-xs">회의록 요약 (수정할 수 있어요)</Label>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={12}
          className="mt-1 resize-none text-sm leading-relaxed"
        />
      </div>

      {/* 받아쓴 원문 (접기/펼치기) */}
      {transcript && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showTranscript ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            받아쓴 원문 보기
          </button>
          {showTranscript && (
            <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 max-h-48 overflow-y-auto">
              {transcript}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={reset} disabled={saving}>
          취소
        </Button>
        <Button
          size="sm"
          className="flex-1 h-10"
          onClick={handleSave}
          disabled={saving || !summary.trim()}
        >
          {saving ? '저장 중...' : '상담 기록으로 저장'}
        </Button>
      </div>
    </div>
  )
}
