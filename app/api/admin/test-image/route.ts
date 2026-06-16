import { NextRequest, NextResponse } from 'next/server'
import { generatePostImage, buildImagePrompt } from '@/lib/ai/image-gen'

// 이미지 생성 테스트용 엔드포인트 (비용 발생 → CRON_SECRET으로 보호)
// 사용 예:
//   /api/admin/test-image?secret=...&seed=에어컨 청소 6월 가이드
//   /api/admin/test-image?secret=...&seed=...&redirect=1  → 생성된 이미지로 바로 이동
export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const secret = params.get('secret') ?? request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const seed = params.get('seed')?.trim()
  if (!seed) {
    return NextResponse.json({ error: 'seed 파라미터가 필요합니다 (글 제목 또는 영문 프롬프트)' }, { status: 400 })
  }

  const prompt = buildImagePrompt(seed)
  const imageUrl = await generatePostImage(seed)

  if (!imageUrl) {
    return NextResponse.json({ ok: false, seed, prompt, error: '이미지 생성 실패 (FAL_KEY/크레딧 확인)' }, { status: 502 })
  }

  // redirect=1 이면 이미지로 바로 이동 (브라우저에서 눈으로 확인용)
  if (params.get('redirect') === '1') {
    return NextResponse.redirect(imageUrl)
  }

  return NextResponse.json({ ok: true, seed, prompt, imageUrl })
}
