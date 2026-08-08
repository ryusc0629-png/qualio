import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ai/transcribe'
import { summarizeMeeting } from '@/lib/ai/meeting-summary'

// 미팅 녹음 → 받아쓰기 → 회의록 요약
// 오디오는 브라우저가 Supabase Storage('meeting-audio')로 직접 올린다(Vercel 4.5MB 요청 한도 우회).
// 이 라우트는 그 '경로'만 받아 서버가 내려받아 처리하고, 끝나면 즉시 오디오를 삭제한다(저장 안 함).
// gpt-4o-transcribe 한도(25MB)까지 받으므로, 32kbps 기준 약 100분 녹음까지 가능하다.
const MAX_SIZE = 24 * 1024 * 1024 // 24MB — 받아쓰기 모델 한도(25MB) 바로 아래

export const maxDuration = 300 // 긴 녹음 전사 대비

export async function POST(request: NextRequest) {
  // 인증 확인 (쿠키 기반)
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

  const { path } = (await request.json().catch(() => ({}))) as { path?: string }
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: '녹음 파일이 없어요' }, { status: 400 })
  }

  const db = createServiceClient()

  // 브라우저가 올려둔 오디오를 서버가 내려받는다 (service_role → 비공개 버킷 접근)
  const { data: fileBlob, error: dlErr } = await db.storage.from('meeting-audio').download(path)
  if (dlErr || !fileBlob) {
    console.error('[MeetingTranscribe] 오디오 다운로드 실패:', dlErr?.message)
    return NextResponse.json({ error: '녹음을 불러오지 못했어요. 다시 시도해주세요' }, { status: 404 })
  }

  try {
    if (fileBlob.size > MAX_SIZE) {
      return NextResponse.json(
        { error: '녹음이 너무 길어요. 100분 안쪽으로 나눠서 정리해주세요' },
        { status: 413 },
      )
    }

    const ext = path.split('.').pop()?.toLowerCase() || 'webm'
    const file = new File([fileBlob], `meeting.${ext}`, { type: fileBlob.type || 'audio/webm' })

    // ① 음성 → 텍스트
    const transcript = await transcribeAudio(file)
    if (!transcript) {
      return NextResponse.json(
        { error: '소리가 잘 안 들렸어요. 조용한 곳에서 다시 녹음해주세요' },
        { status: 422 },
      )
    }

    // ② 텍스트 → 회의록 요약
    const summary = await summarizeMeeting(transcript)

    return NextResponse.json({ transcript, summary })
  } catch (error) {
    // 에러 상세를 한 줄 문자열로 남겨 로그 검색이 가능하도록 함
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error(`[MeetingTranscribe] 처리 실패 상세: ${detail}`)
    const message =
      error instanceof Error && error.message.startsWith('[APP]')
        ? error.message.replace('[APP] ', '')
        : '정리하지 못했어요. 잠시 후 다시 시도해주세요'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    // 처리 후 오디오 삭제 — 민감한 미팅 대화를 남기지 않는다(실패해도 정리)
    await db.storage.from('meeting-audio').remove([path]).catch(() => {})
  }
}
