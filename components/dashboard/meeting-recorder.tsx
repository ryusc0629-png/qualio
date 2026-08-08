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
import { createClient } from '@/lib/supabase/client'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { Mic, Square, Loader2, ChevronDown, ChevronUp, Camera, X, Trash2 } from 'lucide-react'

// 60분 — 오디오는 Storage로 직접 올려 받아쓰기하므로(모델 한도 25MB), 32kbps 기준 넉넉히 커버된다.
const MAX_SECONDS = 60 * 60

// 음성은 32kbps면 받아쓰기에 충분 — 브라우저 기본 비트레이트(수백 kbps)로 두면
// 용량이 금세 커진다. 낮게 고정해 60분 녹음도 ~14MB로 유지한다.
const AUDIO_BITS_PER_SECOND = 32000
// 받아쓰기 모델 한도(25MB) 바로 아래 — 이보다 크면 잘라 안내(내용은 버리지 않음)
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024
// 카메라 해상도 — 미팅 내내 카메라를 켜두므로(음성 안정성 우선) 발열·배터리를 고려해 1080p로.
// 기존 기본값(대개 480p)보다 훨씬 선명하면서도 상시 구동에 무리 없다.
const HI_RES = { width: { ideal: 1920 }, height: { ideal: 1080 } }
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
  // 후면 렌즈 목록(초광각 0.5x가 있는 기기만) + 현재 선택된 렌즈
  const [lenses, setLenses] = useState<{ id: string; label: '0.5x' | '1x' }[]>([])
  const [activeLensId, setActiveLensId] = useState<string | null>(null)
  // 받아쓰기 실패 시 서버에 남겨둔 오디오 경로 — '다시 정리 시도'로 재시도 가능(일시적 오류로 미팅이 통째로 날아가지 않게)
  const [pendingAudioPath, setPendingAudioPath] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 녹음 시작 때 마이크+카메라(1x)를 한 세션으로 함께 잡는다 — 이래야 iOS가 촬영 중 마이크를 안 끊는다.
  // 녹음은 이 스트림의 '오디오 트랙만' 담고, 영상 트랙은 미리보기·촬영에 쓴다.
  const streamRef = useRef<MediaStream | null>(null)
  // 0.5x 초광각용 임시 영상 스트림(별도 렌즈라 그때만 취득). 기본(1x)은 streamRef의 영상 트랙을 재사용.
  const ultraStreamRef = useRef<MediaStream | null>(null)
  // 현재 미리보기에 연결할 스트림(1x=streamRef, 0.5x=ultraStreamRef)
  const previewStreamRef = useRef<MediaStream | null>(null)
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

  // 카메라 오버레이 닫기 — 0.5x 임시 스트림만 정리하고 1x로 되돌린다.
  // 기본 카메라(오디오와 한 세션)는 녹음이 끝날 때까지 계속 켜둔다(끄면 다시 켤 때 마이크가 끊길 위험).
  function stopCameraStream() {
    ultraStreamRef.current?.getTracks().forEach((track) => track.stop())
    ultraStreamRef.current = null
    previewStreamRef.current = streamRef.current
    setActiveLensId(streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId ?? null)
    setCameraOpen(false)
  }

  // 녹음·카메라 세션 전체 정리(녹음 종료·언마운트) — 마이크·카메라 표시등을 끈다.
  function teardownStreams() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    ultraStreamRef.current?.getTracks().forEach((t) => t.stop())
    ultraStreamRef.current = null
    previewStreamRef.current = null
    setCameraOpen(false)
  }

  function reset() {
    discardPendingAudio() // 재시도를 포기하고 나가면 서버에 남은 오디오를 정리
    setPhase('idle')
    setSeconds(0)
    setSummary('')
    setTranscript('')
    setShowTranscript(false)
    setPhotos([])
    stopCameraStream()
  }

  // 재시도를 위해 남겨둔 실패 오디오를 서버에서 삭제(포기·저장 완료 시)
  function discardPendingAudio() {
    if (!pendingAudioPath) return
    const p = pendingAudioPath
    setPendingAudioPath(null)
    void fetch('/api/meeting-transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discard: p }),
    }).catch(() => {})
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
    if (cameraOpen && videoRef.current && previewStreamRef.current) {
      videoRef.current.srcObject = previewStreamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraOpen])

  // 언마운트 시 스트림 정리(마이크·카메라 표시등 꺼짐)
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      ultraStreamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // 녹음 시작
  async function startRecording() {
    try {
      // 마이크+카메라(1x)를 한 번의 getUserMedia로 함께 잡는다.
      // → 녹음 도중 사진/1x 촬영에 새 카메라 요청이 없어 iOS가 마이크를 끊지 않는다(음성 유실 방지).
      // 카메라 권한이 없으면 소리만이라도 녹음(사진은 이번 세션에서 비활성).
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'environment', ...HI_RES },
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      streamRef.current = stream
      previewStreamRef.current = stream

      // 현재(1x) 렌즈 파악 + 초광각(0.5x) 감지 (영상 트랙이 있을 때만)
      if (stream.getVideoTracks().length > 0) {
        const curId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null
        setActiveLensId(curId)
        void detectLenses(curId)
      } else {
        setLenses([])
        setActiveLensId(null)
      }

      // 브라우저별 지원 포맷 선택 (iOS 사파리는 mp4)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''

      // 녹음은 '오디오 트랙만' — 카메라를 켜둔 채여도 파일엔 소리만 담긴다(용량도 그대로 작다).
      const audioStream = new MediaStream(stream.getAudioTracks())
      const recorder = new MediaRecorder(audioStream, {
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
          // 60분 도달 시 자동 종료
          if (prev + 1 >= MAX_SECONDS) {
            stopRecording()
            toast.info('60분이 넘어 녹음을 자동으로 마쳤어요')
          }
          return prev + 1
        })
      }, 1000)
    } catch (error) {
      console.error('[MeetingRecorder] 마이크 접근 실패:', error)
      toast.error('마이크를 쓸 수 없어요. 브라우저의 마이크 권한을 허용해주세요')
    }
  }

  // 녹음 중지 → onstop 트리거. 녹음이 끝나면 마이크·카메라 세션을 모두 정리한다.
  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    mediaRecorderRef.current?.stop()
    teardownStreams()
  }

  // ── 페이지 안 카메라 ─────────────────────────────────────
  // 카메라는 녹음 시작 때 마이크와 함께 이미 잡아둔다 → 여기선 미리보기만 연다(새 getUserMedia 없음 = 음성 안 끊김).
  async function openCamera() {
    if (!streamRef.current?.getVideoTracks().length) {
      toast.error('카메라를 쓸 수 없어요. 카메라 권한을 허용하고 다시 녹음을 시작해주세요')
      return
    }
    previewStreamRef.current = ultraStreamRef.current ?? streamRef.current
    setCameraOpen(true)
  }

  // 후면 렌즈 감지 — 초광각(0.5x)이 있는 기기에서만 0.5x/1x 토글을 띄운다.
  // (권한 허용 후에야 라벨이 채워지므로 openCamera에서 스트림 확보 뒤 호출)
  async function detectLenses(currentId: string | null) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const backs = devices.filter(
        (d) => d.kind === 'videoinput' && /back|rear|environment|후면/i.test(d.label),
      )
      const ultra = backs.find((d) => /ultra|초광각|울트라/i.test(d.label))
      if (!ultra) {
        setLenses([]) // 초광각 없는 기기 → 토글 숨김
        return
      }
      // 1x = 현재 렌즈(초광각이 아니면) 우선, 아니면 초광각이 아닌 첫 후면 렌즈
      const wideId =
        currentId && currentId !== ultra.deviceId
          ? currentId
          : backs.find((d) => d.deviceId !== ultra.deviceId)?.deviceId ?? null
      if (!wideId) {
        setLenses([])
        return
      }
      setLenses([
        { id: ultra.deviceId, label: '0.5x' },
        { id: wideId, label: '1x' },
      ])
    } catch {
      setLenses([])
    }
  }

  // 렌즈 전환. 오디오(녹음)는 항상 기본 스트림(streamRef)에 있어 어떤 경우에도 건드리지 않는다.
  async function switchLens(deviceId: string) {
    if (deviceId === activeLensId) return
    const baseId = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId ?? null
    try {
      if (deviceId === baseId) {
        // 1x로 복귀 — 이미 켜둔 기본(오디오와 한 세션) 카메라 재사용. 0.5x 임시 스트림만 정리(새 getUserMedia 없음).
        ultraStreamRef.current?.getVideoTracks().forEach((t) => t.stop())
        ultraStreamRef.current = null
        previewStreamRef.current = streamRef.current
      } else {
        // 0.5x 초광각 — 별도 렌즈라 임시 스트림을 취득한다(오디오는 기본 세션 유지).
        const ultra = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, ...HI_RES },
        })
        ultraStreamRef.current?.getVideoTracks().forEach((t) => t.stop())
        ultraStreamRef.current = ultra
        previewStreamRef.current = ultra
      }
      setActiveLensId(deviceId)
      if (videoRef.current && previewStreamRef.current) {
        videoRef.current.srcObject = previewStreamRef.current
        videoRef.current.play().catch(() => {})
      }
    } catch (error) {
      console.error('[MeetingRecorder] 렌즈 전환 실패:', error)
      toast.error('다른 렌즈로 바꾸지 못했어요')
    }
  }

  // 셔터음 '찰칵' — Web Audio로 짧은 두 번의 클릭 (촬영 즉시 재생, 사용자 조작이라 iOS 무음스위치와 무관)
  function playShutter() {
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      const click = (start: number, freq: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.005)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.06)
      }
      const now = ctx.currentTime
      click(now, 1800)
      click(now + 0.07, 1150)
      setTimeout(() => ctx.close().catch(() => {}), 300)
    } catch {
      // 소리 재생 실패는 촬영에 영향 없음
    }
  }

  // 촬영 → post-images 버킷 업로드 → URL을 사진 목록에 추가
  async function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    playShutter() // 탭 즉시 '찰칵' — 눌린 느낌을 준다
    setCapturing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('사진을 만들지 못했어요')
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
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

    // 녹음이 아예 없을 때(0바이트)만 되돌린다 — 나머지 경우엔 내용을 절대 통째로 버리지 않는다.
    if (blob.size === 0) {
      toast.error('녹음된 소리가 없어요. 마이크를 확인하고 다시 녹음해주세요')
      setPhase('idle')
      return
    }
    // 100분(24MB)을 넘는 아주 긴 녹음 — 자동 정리는 어렵지만 사진과 직접 메모는 살려 저장하게 한다.
    if (blob.size > MAX_UPLOAD_BYTES) {
      toast.error('녹음이 너무 길어요. 아래에 직접 메모로 남겨 저장해주세요')
      setSummary('')
      setTranscript('')
      setPhase('review')
      return
    }

    // ① 오디오를 브라우저에서 Supabase Storage로 직접 업로드 — Vercel 4.5MB 요청 한도를 우회한다.
    //    (이 방식 덕분에 15분 제한 없이 긴 미팅도 내용이 날아가지 않는다)
    let path: string
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      path = `${user?.id ?? 'anon'}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('meeting-audio')
        .upload(path, blob, { contentType: mime, upsert: false })
      if (upErr) throw new Error('녹음 업로드에 실패했어요. 연결을 확인하고 다시 시도해주세요')
    } catch (error) {
      console.error('[MeetingRecorder] 업로드 실패:', error)
      // 업로드조차 안 되면 사진·직접 메모로라도 저장하게 검토 화면으로(내용 통째 유실 방지)
      toast.error(
        (error instanceof Error ? error.message : '녹음 업로드에 실패했어요') +
          ' · 아래에 직접 메모로 남겨 저장할 수 있어요',
      )
      setSummary('')
      setTranscript('')
      setPhase('review')
      return
    }

    // ② 서버엔 경로만 넘겨 받아쓰기 + 요약 (실패해도 오디오는 서버에 남아 재시도 가능)
    await runTranscribe(path)
  }

  // 업로드된 오디오를 서버에서 받아쓰기 + 요약. 실패해도 오디오를 남겨 '다시 정리 시도'가 가능하게 한다.
  async function runTranscribe(path: string) {
    setPhase('processing')
    let res: Response
    try {
      res = await fetch('/api/meeting-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
    } catch {
      // 네트워크 오류 — 오디오는 서버에 남아 있으니 재시도 가능
      setPendingAudioPath(path)
      toast.error('연결이 불안정해요 · 아래 메모로 저장하거나 다시 정리를 시도할 수 있어요')
      setSummary('')
      setTranscript('')
      setPhase('review')
      return
    }

    const data = await res.json().catch(() => null)
    if (res.ok && data && (data.summary || data.transcript)) {
      setTranscript(data.transcript ?? '')
      setSummary(data.summary ?? '')
      setPendingAudioPath(null) // 성공 → 서버가 오디오를 삭제함
      setPhase('review')
      return
    }

    // 실패 — 413(너무 김)은 오디오가 서버에서 지워졌으니 재시도 불가, 그 외엔 재시도 가능
    const retryable = res.status !== 413
    setPendingAudioPath(retryable ? (data?.path ?? path) : null)
    toast.error(
      (data?.error ?? '정리하지 못했어요') +
        (retryable
          ? ' · 아래 메모로 저장하거나 다시 정리를 시도할 수 있어요'
          : ' · 아래에 직접 메모로 남겨 저장해주세요'),
    )
    setSummary('')
    setTranscript('')
    setPhase('review')
  }

  // 남겨둔 오디오로 받아쓰기 재시도
  async function retryTranscribe() {
    if (pendingAudioPath) await runTranscribe(pendingAudioPath)
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
            녹음하면서 아래 <b>사진 찍기</b>로 현장 사진을 담을 수 있어요.
            <br />
            녹음이 끊기지 않도록 카메라를 함께 켜둬요 (사진은 &lsquo;사진 찍기&rsquo;를 눌러야만 찍혀요)
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
        {/* 세로·가로 모두 대응: 영상은 화면 전체를 채우고, 조작 버튼은 위/아래에 겹쳐 띄운다(그라데이션 스크림으로 가독성 확보) */}
        {cameraOpen && (
          <div
            ref={(el) => el?.focus()}
            tabIndex={-1}
            className="fixed inset-0 bg-black z-50 outline-none"
          >
            <ScrollLock />

            {/* 영상 미리보기 — 전체 화면 채움(가로에서도 세로처럼 꽉 참) */}
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-contain"
            />

            {/* 상단 바 — 녹음 표시 + 닫기 */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white bg-gradient-to-b from-black/70 to-transparent">
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
                className="h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center shrink-0"
                aria-label="카메라 닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 하단 바 — 사진 썸네일 + 렌즈 전환 + 셔터 */}
            <div className="absolute bottom-0 inset-x-0 px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent">
              {photos.length > 0 && (
                <div className="w-full overflow-x-auto overscroll-contain">
                  <PhotoStrip removable={false} />
                </div>
              )}
              {/* 렌즈 전환(0.5x 초광각 / 1x) — 초광각 있는 기기에서만 노출 */}
              {lenses.length >= 2 && (
                <div className="flex items-center gap-1 rounded-full bg-white/15 p-1">
                  {lenses.map((lens) => (
                    <button
                      key={lens.id}
                      type="button"
                      onClick={() => switchLens(lens.id)}
                      className={[
                        'px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors',
                        activeLensId === lens.id ? 'bg-white text-black' : 'text-white',
                      ].join(' ')}
                    >
                      {lens.label}
                    </button>
                  ))}
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
        )}
      </>
    )
  }

  // 처리 중
  if (phase === 'processing') {
    return (
      <div className="bg-white rounded-xl border p-8 space-y-3 text-center">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
        <p className="text-sm font-medium">녹음을 올리고 정리하고 있어요...</p>
        <p className="text-xs text-muted-foreground">
          녹음 길이에 따라 1~2분 걸릴 수 있어요. 이 화면을 벗어나지 말고 잠시만 기다려주세요
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
        {/* 자동 정리가 안 된 경우(너무 긴 녹음·처리 실패) — 사진은 그대로 살아 있고, 여기 직접 적어 저장하면 된다 */}
        {!transcript && (
          <p className="mt-1 text-xs text-amber-600 leading-relaxed">
            자동 정리가 어려웠어요. 아래에 미팅 내용을 직접 적어 저장해주세요. (찍은 사진은 그대로 저장돼요)
          </p>
        )}
        {/* 실패했지만 녹음은 서버에 남아 있음 → 한 번 더 자동 정리를 시도할 수 있게 */}
        {pendingAudioPath && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full h-10 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
            onClick={retryTranscribe}
            disabled={saving}
          >
            <Mic className="h-4 w-4" />
            녹음으로 다시 정리 시도
          </Button>
        )}
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={12}
          placeholder="미팅에서 나눈 내용을 자유롭게 적어주세요 — 예: 요청 사항, 견적 관련 협의, 다음 약속"
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
