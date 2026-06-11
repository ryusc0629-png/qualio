import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// 허용 이미지 타입
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  // 인증 확인
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

  // 파일 유효성 검사
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'JPG, PNG, WEBP 이미지만 올릴 수 있어요' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하여야 해요' }, { status: 400 })
  }

  const db = createServiceClient()

  // 파일 경로: userId/timestamp.ext
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filePath = `${user.id}/${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await db.storage
    .from('post-images')
    .upload(filePath, buffer, { contentType: file.type, upsert: false })

  if (error) {
    console.error('[Upload] 스토리지 업로드 실패:', error)
    return NextResponse.json({ error: '업로드에 실패했어요. 다시 시도해주세요' }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage
    .from('post-images')
    .getPublicUrl(filePath)

  return NextResponse.json({ url: publicUrl })
}
