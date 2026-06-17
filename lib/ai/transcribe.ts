// OpenAI 음성인식(STT) — 녹음된 오디오를 한국어 텍스트로 변환
// gpt-4o-transcribe 모델 사용, 한 번에 최대 25MB

export async function transcribeAudio(file: File): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('[APP] 음성인식 설정이 아직 안 됐어요. 관리자에게 문의해주세요')
  }

  const form = new FormData()
  form.append('file', file)
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
