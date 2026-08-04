'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createLeadActivityAction } from '@/lib/actions/crm'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { Mic, Square, Loader2, ChevronDown, ChevronUp, Camera, X, Trash2 } from 'lucide-react'

const MAX_SECONDS = 15 * 60 // 15분 — 이보다 길면 파일이 서버 업로드 한도를 넘어 저장이 안 됨

// 음성은 32kbps면 받아쓰기에 충분 — 브라우저 기본 비트레이트(수백 kbps)로 두면
// 3분만 녹음해도 파일이 4.5MB를 넘어 Vercel이 요청을 거부한다(413). 낮게 고정해 용량을 줄인다.
const AUDIO_BITS_PER_SECOND = 32000
// 업로드 전 안전 상한 — Vercel 서버리스 요청 본문 한도(4.5MB)보다 여유 있게 잡는다
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
// 조각 저장 간격 — 이 간격마다 녹음 데이터를 메모리로 흘려두어, 도중에 끊겨도 여기까지는 보존한다.
const TIMESLICE_MS = 1000

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

  // 현장 사진(페이지 안 카메라로 촬영한 공개 URL 목록)
  const [photos, setPhotos] = useState<string[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // 카메라(영상) 스트림 — 녹음(오디오) 스트림과 별개로 관리해 마이크는 건드리지 않는다.
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // 다른 화면(카메라 앱 등)으로 나가 자동 종료됐는지 표시 — 처리 후 안내 문구용
  const autoStoppedRef = useRef(false)

  const { execute: save, isPending: saving } = useAction(createLeadActivityAction, {
    onSuccess: () => {
      toast.success('미팅 기록을 저장했어요!')
      reset()
      startTransition(() => router.refresh())
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  function stopCameraStream() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraOpen(false)
  }

  function reset() {
    setPhase('idle')
    setSeconds(0)
    setSummary('')
    setTranscript('')
    setShowTranscript(false)
    setPhotos([])
    stopCameraStream()
  }

  // 녹음 중에 다른 앱(카메라·홈 등)으로 나가면 iOS가 백그라운드 탭의 마이크를 끊는다.
  // 페이지가 숨겨지는 순간(=진짜 앱 전환)을 감지해 자동으로 녹음을 마치고, 조각 저장분까지 정리한다.
  // 우리 '페이지 안 카메라'는 화면을 벗어나지 않으므로 이 감지가 오작동하지 않는다.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && phase === 'recording') {
        autoStoppedRef.current = true
        stopRecording()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
    // phase가 바뀔 때마다 최신 상태로 재바인딩
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 카메라 오버레이가 열리면 영상 스트림을 미리보기 <video>에 연결
  useEffect(() => {
    if (cameraOpen && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraOpen])

  // 언마운트 시 스트림 정리(마이크·카메라 표시등 꺼짐)
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

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

      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = handleStop
      autoStoppedRef.current = false
      // 조각 단위로 흘려 저장 → 도중에 끊겨도 여기까지는 살아남는다
      recorder.start(TIMESLICE_MS)
      mediaRecorderRef.current = recorder

      setPhase('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          // 15분 도달 시 자동 종료
          if (prev + 1 >= MAX_SECONDS) {
            stopRecording()
            toast.info('15분이 넘어 녹음을 자동으로 마쳤어요')
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
    stopCameraStream()
  }

  // ── 페이지 안 카메라 ─────────────────────────────────────
  // 녹음을 유지한 채(앱 전환 없이) 현장 사진을 찍는다.
  async function openCamera() {
    try {
      if (!cameraStreamRef.current) {
        cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
      }
      setCameraOpen(true)
    } catch (error) {
      console.error('[MeetingRecorder] 카메라 접근 실패:', error)
      toast.error('카메라를 쓸 수 없어요. 카메라 권한을 허용해주세요')
    }
  }

  // 촬영 → post-images 버킷 업로드 → URL을 사진 목록에 추가
  async function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setCapturing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('사진을 만들지 못했어요')
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
      )
      if (!blob) throw new Error('사진을 만들지 못했어요')

      const file = new File([blob], `meeting-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!res.ok || !data?.url) throw new Error(data?.error ?? '사진을 저장하지 못했어요')

      setPhotos((prev) => [...prev, data.url as string])
      toast.success('사진을 담았어요')
    } catch (error) {
      console.error('[MeetingRecorder] 사진 저장 실패:', error)
      toast.error(error instanceof Error ? error.message : '사진을 저장하지 못했어요')
    } finally {
      setCapturing(false)
    }
  }

  // 녹음 종료 후: 서버로 보내 받아쓰기 + 요약
  async function handleStop() {
    setPhase('processing')
    if (autoStoppedRef.current) {
      toast.info('다른 화면으로 나가서 녹음을 멈췄어요. 여기까지 정리해 드릴게요')
    }

    const mime = mediaRecorderRef.current?.mimeType ?? 'audio/webm'
    const ext = mime.includes('mp4') ? 'mp4' : 'webm'
    const blob = new Blob(chunksRef.current, { type: mime })

    // 녹음이 없거나(0바이트) 서버 한도를 넘으면 미리 걸러 명확히 안내
    if (blob.size === 0) {
      toast.error('녹음된 소리가 없어요. 마이크를 확인하고 다시 녹음해주세요')
      setPhase('idle')
      return
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      toast.error('녹음이 너무 길어요. 15분 안쪽으로 나눠서 정리해주세요')
      setPhase('idle')
      return
    }

    const file = new File([blob], `meeting.${ext}`, { type: mime })

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/meeting-transcribe', { method: 'POST', body: form })

      // 413(용량 초과)·504(시간 초과) 등은 JSON이 아닌 응답이 올 수 있어 안전하게 파싱
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        if (res.status === 413) throw new Error('녹음이 너무 길어요. 15분 안쪽으로 나눠서 정리해주세요')
        throw new Error(data?.error ?? '정리하지 못했어요. 잠시 후 다시 시도해주세요')
      }

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
      photos,
      activity_at: new Date(activityDate).toISOString(),
    })
  }

  // 사진 썸네일 목록(녹음 중·검토 단계 공용)
  function PhotoStrip({ removable }: { removable: boolean }) {
    if (photos.length === 0) return null
    return (
      <div className="flex flex-wrap gap-2">
        {photos.map((url, idx) => (
          <div key={url} className="relative h-16 w-16 rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`현장 사진 ${idx + 1}`} className="h-full w-full object-cover" />
            {removable && (
              <button
                type="button"
                onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label="사진 삭제"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    )
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
      <>
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
            녹음하면서 아래 <b>사진 찍기</b>로 현장 사진을 담을 수 있어요 (녹음 안 끊겨요)
          </p>

          {photos.length > 0 && (
            <div className="flex justify-center">
              <PhotoStrip removable />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-base"
              onClick={openCamera}
            >
              <Camera className="h-5 w-5 mr-2" />
              사진 찍기
            </Button>
            <Button
              size="lg"
              className="h-14 text-base bg-red-600 hover:bg-red-700"
              onClick={stopRecording}
            >
              <Square className="h-5 w-5 mr-2 fill-current" />
              끝내고 정리
            </Button>
          </div>
        </div>

        {/* 페이지 안 카메라 오버레이 — 화면을 벗어나지 않아 녹음이 유지된다 */}
        {cameraOpen && (
          <div className="fixed inset-0 bg-black z-50 flex flex-col">
            <ScrollLock />
            <div
              ref={(el) => el?.focus()}
              tabIndex={-1}
              className="flex-1 flex flex-col outline-none"
            >
              <div className="flex items-center justify-between p-4 text-white">
                <span className="text-sm font-medium flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  녹음 계속되는 중 · {formatTime(seconds)}
                </span>
                <button
                  type="button"
                  onClick={() => setCameraOpen(false)}
                  className="h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center"
                  aria-label="카메라 닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 relative overflow-hidden">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>

              <div className="p-5 flex flex-col items-center gap-3">
                {photos.length > 0 && (
                  <div className="w-full overflow-x-auto overscroll-contain">
                    <PhotoStrip removable={false} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={capturing}
                  className="h-16 w-16 rounded-full bg-white ring-4 ring-white/40 flex items-center justify-center disabled:opacity-60"
                  aria-label="촬영"
                >
                  {capturing ? (
                    <Loader2 className="h-7 w-7 animate-spin text-black" />
                  ) : (
                    <Camera className="h-7 w-7 text-black" />
                  )}
                </button>
                <p className="text-xs text-white/70">찍은 사진은 이 미팅 기록에 함께 저장돼요</p>
              </div>
            </div>
          </div>
        )}
      </>
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

      {/* 현장 사진 */}
      {photos.length > 0 && (
        <div>
          <Label className="text-xs">현장 사진 ({photos.length}장)</Label>
          <div className="mt-1">
            <PhotoStrip removable />
          </div>
        </div>
      )}

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
            <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 max-h-48 overflow-y-auto overscroll-contain">
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
