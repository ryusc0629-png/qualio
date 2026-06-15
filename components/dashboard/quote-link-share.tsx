'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Link as LinkIcon, Check } from 'lucide-react'

export function QuoteLinkShare({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5 h-8 text-xs shrink-0"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" />
          복사됐어요!
        </>
      ) : (
        <>
          <LinkIcon className="h-3.5 w-3.5" />
          견적 링크 복사
        </>
      )}
    </Button>
  )
}
