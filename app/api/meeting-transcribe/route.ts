import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ai/transcribe'
import { summarizeMeeting } from '@/lib/ai/meeting-summary'

// 미팅 녹음 → 받아쓰기 → 회의록 요약
// 오디오는 저장하지 않고 처리 후 버림(텍스트만 클라이언트로 반환)
const MAX_SIZE = 25 * 1024 * 1024 // 25MB — OpenAI 한 번 처리 한도

export const maxDuration = 300 // 긴 녹음 전사 대비

export async function POST(request: NextRequest) {
  // 인증 확인 (쿠키 기반)
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '녹음 파일이 없어요' }, { status: 400 })

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: '녹음이 너무 길어요. 25분 이내로 나눠서 녹음해주세요' },
      { status: 400 },
    )
  }

  try {
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
  }
}
