'use client'

import { useState, useCallback, useEffect } from 'react'
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageLightboxProps {
  images: { url: string; caption?: string }[]
  initialIndex?: number
  onClose: () => void
}

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const current = images[index]

  const goPrev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length])
  const goNext = useCallback(() => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length])

  // 키보드 & 스와이프
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goPrev, goNext])

  // 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleDownload = async () => {
    if (!current) return
    try {
      const res = await fetch(current.url)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `photo-${index + 1}.jpg`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // 다운로드 실패 시 새 탭으로 열기
      window.open(current.url, '_blank')
    }
  }

  if (!current) return null

  return (
    <div ref={(el) => el?.focus()} tabIndex={-1} className="fixed inset-0 z-50 bg-black/95 flex flex-col outline-none">
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-white/70 text-sm">
          {index + 1} / {images.length}
          {current.caption && <span className="ml-2">{current.caption}</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="다운로드"
          >
            <Download className="h-5 w-5 text-white" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* 이미지 */}
      <div className="flex-1 flex items-center justify-center px-4 relative min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.caption ?? `사진 ${index + 1}`}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />

        {/* 좌우 화살표 */}
        {images.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
              aria-label="이전"
            >
              <ChevronLeft className="h-6 w-6 text-white" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
              aria-label="다음"
            >
              <ChevronRight className="h-6 w-6 text-white" />
            </button>
          </>
        )}
      </div>

      {/* 하단 썸네일 (3장 이상일 때) */}
      {images.length > 2 && (
        <div className="flex justify-center gap-2 px-4 py-3 shrink-0">
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => setIndex(i)}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${
                i === index ? 'border-white' : 'border-transparent opacity-50'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 사진 그리드 + 클릭 시 라이트박스 열기
interface PhotoGridProps {
  photos: { url: string; caption?: string }[]
  columns?: number
}

export function PhotoGrid({ photos, columns = 3 }: PhotoGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (photos.length === 0) return null

  return (
    <>
      <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {photos.map((photo, i) => (
          <button
            key={photo.url}
            onClick={() => setLightboxIndex(i)}
            className="aspect-square rounded-lg overflow-hidden border hover:opacity-90 transition-opacity cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.caption ?? ''} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
