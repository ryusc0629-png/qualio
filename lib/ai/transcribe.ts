// OpenAI 음성인식(STT) — 녹음된 오디오를 한국어 텍스트로 변환
// gpt-4o-transcribe 모델 사용, 한 번에 최대 25MB

export async function transcribeAudio(file: File): Promise<string> {
  // 키 끝에 줄바꿈/공백이 섞여 들어오면 Authorization 헤더 생성 시 TypeError가 나므로 정리
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('[APP] 음성인식 설정이 아직 안 됐어요. 관리자에게 문의해주세요')
  }

  // 업로드된 File을 그대로 재전송하면 서버리스(undici) 환경에서 스트림이 깨질 수 있어,
  // 새 Blob으로 다시 만들어 파일명과 함께 전송한다
  const arrayBuffer = await file.arrayBuffer()
  const ext = file.name?.split('.').pop()?.toLowerCase() || 'webm'
  const blob = new Blob([arrayBuffer], { type: file.type || 'audio/webm' })

  const form = new FormData()
  form.append('file', blob, `meeting.${ext}`)
  form.append('model', 'gpt-4o-transcribe')
  form.append('language', 'ko')
  form.append('response_format', 'text')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[Transcribe] OpenAI 오류:', res.status, errText)
    throw new Error('[APP] 음성을 글자로 바꾸지 못했어요. 잠시 후 다시 시도해주세요')
  }

  // response_format=text → 응답 본문이 곧 받아쓴 텍스트
  const text = await res.text()
  return text.trim()
}
