import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ai/transcribe'
import { summarizeMeeting } from '@/lib/ai/meeting-summary'

// 미팅 녹음 → 받아쓰기 → 회의록 요약
// 오디오는 브라우저가 Supabase Storage('meeting-audio')로 직접 올린다(Vercel 4.5MB 요청 한도 우회).
// 이 라우트는 그 '경로'만 받아 서버가 내려받아 처리한다.
// - 성공하면 오디오를 즉시 삭제(저장 안 함).
// - 실패하면 오디오를 남겨둔다 → 사장님이 '다시 정리 시도'로 재시도할 수 있게(일시적 오류로 미팅이 통째로 날아가지 않도록).
//   재시도도 포기하면 클라이언트가 { discard } 로 삭제를 요청한다.
// gpt-4o-transcribe 한도(25MB)까지 받으므로, 32kbps 기준 약 100분 녹음까지 가능하다.
const MAX_SIZE = 24 * 1024 * 1024 // 24MB — 받아쓰기 모델 한도(25MB) 바로 아래

export const maxDuration = 300 // 긴 녹음 전사 대비

export async function POST(request: NextRequest) {
  // 인증 확인 (쿠키 기반)
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { path?: string; discard?: string }
  const db = createServiceClient()

  // 포기 시 오디오 정리 요청 — 남겨둔 실패 오디오를 삭제한다
  if (typeof body.discard === 'string' && body.discard) {
    await db.storage.from('meeting-audio').remove([body.discard]).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  const path = body.path
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: '녹음 파일이 없어요' }, { status: 400 })
  }

  // 브라우저가 올려둔 오디오를 서버가 내려받는다 (service_role → 비공개 버킷 접근)
  const { data: fileBlob, error: dlErr } = await db.storage.from('meeting-audio').download(path)
  if (dlErr || !fileBlob) {
    console.error('[MeetingTranscribe] 오디오 다운로드 실패:', dlErr?.message)
    return NextResponse.json({ error: '녹음을 불러오지 못했어요. 다시 시도해주세요', path }, { status: 404 })
  }

  // 너무 큰 녹음은 재시도해도 안 되므로 여기서 정리하고 안내
  if (fileBlob.size > MAX_SIZE) {
    await db.storage.from('meeting-audio').remove([path]).catch(() => {})
    return NextResponse.json(
      { error: '녹음이 너무 길어요. 100분 안쪽으로 나눠서 정리해주세요' },
      { status: 413 },
    )
  }

  try {
    const ext = path.split('.').pop()?.toLowerCase() || 'webm'
    const file = new File([fileBlob], `meeting.${ext}`, { type: fileBlob.type || 'audio/webm' })

    // ① 음성 → 텍스트
    const transcript = await transcribeAudio(file)
    if (!transcript) {
      // 소리가 안 들린 경우 — 오디오는 남겨 재시도 가능하게 하고 path를 함께 반환
      return NextResponse.json(
        { error: '소리가 잘 안 들렸어요. 조용한 곳에서 녹음됐는지 확인 후 다시 시도해주세요', path },
        { status: 422 },
      )
    }

    // ② 텍스트 → 회의록 요약
    const summary = await summarizeMeeting(transcript)

    // 성공 — 오디오는 남기지 않는다(민감한 미팅 대화)
    await db.storage.from('meeting-audio').remove([path]).catch(() => {})

    return NextResponse.json({ transcript, summary })
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error(`[MeetingTranscribe] 처리 실패 상세: ${detail}`)
    const message =
      error instanceof Error && error.message.startsWith('[APP]')
        ? error.message.replace('[APP] ', '')
        : '정리하지 못했어요. 잠시 후 다시 시도해주세요'
    // 실패 시 오디오를 남겨둔다 → 클라이언트가 path로 재시도할 수 있음
    return NextResponse.json({ error: message, path }, { status: 500 })
  }
}
