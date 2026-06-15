'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { saveNaverBlogAction, disconnectNaverBlogAction } from '@/lib/actions/naver'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Link2Off, ExternalLink } from 'lucide-react'

interface NaverBlogPanelProps {
  naverBlogId: string | null
}

export function NaverBlogPanel({ naverBlogId: initialBlogId }: NaverBlogPanelProps) {
  const [isConnected, setIsConnected] = useState(!!initialBlogId)
  const [blogId, setBlogId] = useState('')
  const [apiKey, setApiKey]  = useState('')

  const { execute: save, isPending: isSaving } = useAction(saveNaverBlogAction, {
    onSuccess: () => {
      toast.success('네이버 블로그가 연동됐어요!')
      setIsConnected(true)
      setBlogId('')
      setApiKey('')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '연동에 실패했어요. 다시 시도해주세요'),
  })

  const { execute: disconnect, isPending: isDisconnecting } = useAction(disconnectNaverBlogAction, {
    onSuccess: () => {
      toast.success('연동이 해제됐어요')
      setIsConnected(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '해제에 실패했어요'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    save({ naver_blog_id: blogId, naver_blog_api_key: apiKey })
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* 네이버 로고 색상 */}
          <div className="w-8 h-8 rounded-lg bg-[#03C75A] flex items-center justify-center text-white font-bold text-sm">
            N
          </div>
          <div>
            <h2 className="font-semibold text-sm">네이버 블로그 연동</h2>
            <p className="text-xs text-muted-foreground">AI 포스트를 블로그 초안으로 자동 저장</p>
          </div>
        </div>
        {isConnected && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />연동됨
          </span>
        )}
      </div>

      {isConnected ? (
        /* 연동된 상태 */
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">연동 완료</p>
            <p className="text-xs mt-0.5 text-emerald-600">
              AI 포스트 발행 시 네이버 블로그에도 초안이 자동 저장됩니다.
              블로그에서 검토 후 직접 발행해주세요.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://blog.naver.com/${initialBlogId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              내 블로그 바로가기
            </a>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => {
                if (confirm('네이버 블로그 연동을 해제할까요?')) {
                  disconnect({})
                }
              }}
              disabled={isDisconnecting}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Link2Off className="h-3.5 w-3.5" />
              {isDisconnecting ? '해제 중...' : '연동 해제'}
            </button>
          </div>
        </div>
      ) : (
        /* 미연동 상태 — 입력 폼 */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 안내 */}
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800 space-y-1.5">
            <p className="font-medium">API 키 발급 방법</p>
            <ol className="space-y-1 list-decimal list-inside text-blue-700">
              <li>네이버 블로그 접속 → 내 블로그</li>
              <li>관리 → 기본 설정 → 블로그 API</li>
              <li>"API 키 발급받기" 클릭 후 복사</li>
            </ol>
            <a
              href="https://blog.naver.com/setup/BlogApiSetting.naver"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:underline mt-1"
            >
              <ExternalLink className="h-3 w-3" />
              API 키 발급 페이지 바로가기
            </a>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="naverBlogId">네이버 아이디 (필수)</Label>
              <Input
                id="naverBlogId"
                placeholder="예: myclean123"
                value={blogId}
                onChange={(e) => setBlogId(e.target.value)}
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="naverApiKey">블로그 API 키 (필수)</Label>
              <Input
                id="naverApiKey"
                type="password"
                placeholder="API 키를 붙여넣어 주세요"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-12" disabled={isSaving}>
            {isSaving ? '연결 확인 중...' : '네이버 블로그 연동하기'}
          </Button>
        </form>
      )}
    </div>
  )
}
