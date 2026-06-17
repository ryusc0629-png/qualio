'use client'

import { useState } from 'react'
import { ArrowRight, Play } from 'lucide-react'

interface PortfolioCaseCardProps {
  title: string
  summary: string | null
  beforeImageUrl: string | null
  afterImageUrl: string | null
  reelUrl: string | null
}

export function PortfolioCaseCard({
  title,
  summary,
  beforeImageUrl,
  afterImageUrl,
  reelUrl,
}: PortfolioCaseCardProps) {
  const [showAfter, setShowAfter] = useState(false)

  const hasImages = beforeImageUrl && afterImageUrl

  return (
    <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
      {/* Before/After 사진 */}
      {hasImages && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={showAfter ? afterImageUrl : beforeImageUrl}
            alt={showAfter ? '작업 후' : '작업 전'}
            className="w-full aspect-[16/10] object-cover"
          />

          {/* Before/After 토글 */}
          <div className="absolute bottom-3 left-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowAfter(false)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                !showAfter
                  ? 'bg-white text-zinc-900 shadow-md'
                  : 'bg-black/40 text-white backdrop-blur-sm'
              }`}
            >
              Before
            </button>
            <button
              type="button"
              onClick={() => setShowAfter(true)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                showAfter
                  ? 'bg-white text-zinc-900 shadow-md'
                  : 'bg-black/40 text-white backdrop-blur-sm'
              }`}
            >
              After
            </button>
          </div>

          {/* 릴스 영상 링크 */}
          {reelUrl && (
            <a
              href={reelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/50 text-white text-xs font-semibold backdrop-blur-sm hover:bg-black/70 transition-colors"
            >
              <Play className="h-3 w-3 fill-white" />
              영상 보기
            </a>
          )}
        </div>
      )}

      {/* 텍스트 */}
      <div className="px-5 py-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="font-bold text-sm text-zinc-900 line-clamp-1">{title}</p>
        </div>
        {summary && (
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 pl-5.5">{summary}</p>
        )}
      </div>
    </div>
  )
}
