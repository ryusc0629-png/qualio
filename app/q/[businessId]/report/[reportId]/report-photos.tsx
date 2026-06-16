'use client'

import { PhotoGrid } from '@/components/ui/image-lightbox'

interface ReportPhotoSectionProps {
  photos: { url: string; caption?: string }[]
}

// 고객용 보고서 페이지의 사진 영역 — 클릭 시 라이트박스 열림
export function ReportPhotoSection({ photos }: ReportPhotoSectionProps) {
  return <PhotoGrid photos={photos} columns={2} />
}
