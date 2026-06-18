import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

  const isImage = file.type.startsWith('image/') || file.type === ''
  if (!isImage) {
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요 (JPG, PNG, WEBP)' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 5MB 이하여야 해요' }, { status: 400 })
  }

  const db = createServiceClient()

  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filePath = `hero-images/${user.id}/${Date.now()}.${rawExt}`
  const contentType = file.type || 'image/jpeg'

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await db.storage
    .from('post-images')
    .upload(filePath, buffer, { contentType, upsert: true })

  if (error) {
    console.error('[Hero Image Upload] 스토리지 업로드 실패:', error.message)
    return NextResponse.json({ error: '업로드에 실패했어요. 다시 시도해주세요' }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage
    .from('post-images')
    .getPublicUrl(filePath)

  return NextResponse.json({ url: publicUrl })
}
