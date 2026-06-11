import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB (아이폰 사진 대응)

export async function POST(request: NextRequest) {
  // 인증 확인
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

  // 이미지 타입 체크 — HEIC/HEIF는 브라우저마다 MIME이 달라서 image/* 전체 허용
  // 단, 완전히 비어있거나 application/ 타입은 거부
  const isImage = file.type.startsWith('image/') || file.type === '' // 타입 미감지 허용
  if (!isImage && !file.type.includes('heic') && !file.type.includes('heif')) {
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요 (JPG, PNG, WEBP, HEIC)' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 20MB 이하여야 해요' }, { status: 400 })
  }

  const db = createServiceClient()

  // 확장자 결정 — HEIC는 jpg로 저장 (Storage 호환성)
  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ext = ['heic', 'heif'].includes(rawExt) ? 'jpg' : rawExt
  const filePath = `${user.id}/${Date.now()}.${ext}`

  // 업로드할 contentType 결정
  const contentType = file.type || 'image/jpeg'

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await db.storage
    .from('post-images')
    .upload(filePath, buffer, { contentType, upsert: false })

  if (error) {
    console.error('[Upload] 스토리지 업로드 실패:', error.message, error)
    // 버킷이 없을 때 명확한 안내
    if (error.message?.includes('Bucket not found') || error.message?.includes('bucket')) {
      return NextResponse.json({ error: '스토리지 설정이 필요해요. 관리자에게 문의해주세요' }, { status: 500 })
    }
    return NextResponse.json({ error: '업로드에 실패했어요. 다시 시도해주세요' }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage
    .from('post-images')
    .getPublicUrl(filePath)

  return NextResponse.json({ url: publicUrl })
}
