'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateGeoContentAction, updateSlugAction } from '@/lib/actions/geo'
import { Sparkles, Copy, ExternalLink, RefreshCw } from 'lucide-react'

interface FaqItem {
  question: string
  answer: string
}

interface Props {
  businessId: string
  businessName?: string | null
  slug: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  seoFaqs: FaqItem[]
  seoGeneratedAt: string | null
}

// 업체명을 주소(slug)로 변환 — 영문 소문자/숫자/하이픈만(한글·특수문자 제거).
// 공유 시 깨짐·정규화 문제를 피하려고 영어만 허용한다.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

// 입력칸에서 영문 외 문자는 즉시 제거 (한글 입력 자체를 막음)
const sanitizeSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '')

export function GeoPanel({
  businessName,
  slug: initialSlug,
  seoTitle: initialTitle,
  seoDescription: initialDescription,
  seoKeywords: initialKeywords,
  seoFaqs: initialFaqs,
  seoGeneratedAt,
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const suggestedSlug = slugify(businessName ?? '')

  const [slug, setSlug]               = useState(initialSlug ?? '')
  const [editingSlug, setEditingSlug] = useState(false)
  const [newSlug, setNewSlug]         = useState(initialSlug ?? '')
  const [seoTitle, setSeoTitle]       = useState(initialTitle ?? '')
  const [seoDesc, setSeoDesc]         = useState(initialDescription ?? '')
  const [keywords, setKeywords]       = useState(initialKeywords ?? '')
  const [faqs, setFaqs]               = useState<FaqItem[]>(initialFaqs)

  const publicUrl = slug ? `${appUrl}/biz/${slug}` : null

  // AI GEO 콘텐츠 생성
  const { execute: generate, isPending: isGenerating } = useAction(generateGeoContentAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      setSlug(data.slug)
      setNewSlug(data.slug)
      setSeoTitle(data.geoContent.seoTitle)
      setSeoDesc(data.geoContent.seoDescription)
      setKeywords(data.geoContent.seoKeywords)
      setFaqs(data.geoContent.faqs)
      toast.success('GEO 콘텐츠가 생성되었습니다!')
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'GEO 콘텐츠 생성에 실패했습니다'),
  })

  // slug 변경
  const { execute: updateSlug, isPending: isUpdatingSlug } = useAction(updateSlugAction, {
    onSuccess: () => {
      setSlug(newSlug)
      setEditingSlug(false)
      toast.success('페이지 주소가 변경되었습니다')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '주소 변경에 실패했습니다'),
  })

  const copyUrl = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    toast.success('링크가 복사되었습니다')
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            GEO 자동화
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            AI가 ChatGPT·Gemini·Perplexity에 인용되는 업체 페이지를 자동 생성합니다
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => generate({})}
          disabled={isGenerating}
          className="gap-2 shrink-0"
        >
          {isGenerating ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isGenerating ? 'AI 생성 중...' : (slug ? '재생성' : 'AI로 생성하기')}
        </Button>
      </div>

      {/* 공개 페이지 URL */}
      {slug && (
        <div className="space-y-2">
          <Label>공개 페이지 주소</Label>
          {editingSlug ? (
            <div className="space-y-2.5">
              {/* 주소 입력 — 한 줄 전체 */}
              <div className="flex items-center gap-1 rounded-lg border bg-muted px-3 text-sm focus-within:ring-2 focus-within:ring-primary/30">
                <span className="text-muted-foreground shrink-0">{appUrl}/biz/</span>
                <input
                  value={newSlug}
                  onChange={(e) => setNewSlug(sanitizeSlug(e.target.value))}
                  className="flex-1 min-w-0 bg-transparent outline-none py-2.5 font-medium"
                  placeholder="dartclean"
                  autoFocus
                />
              </div>

              {/* 추천 주소 한 번에 채우기 */}
              {suggestedSlug && suggestedSlug.length >= 3 && suggestedSlug !== newSlug && (
                <button
                  type="button"
                  onClick={() => setNewSlug(suggestedSlug)}
                  className="text-xs text-primary hover:underline text-left"
                >
                  추천 주소 쓰기: <span className="font-semibold">{appUrl}/biz/{suggestedSlug}</span>
                </button>
              )}

              {/* 저장 / 취소 — 버튼 행 (삐져나가지 않게) */}
              <div className="flex gap-2 pt-0.5">
                <Button
                  type="button"
                  className="flex-1 h-10"
                  disabled={isUpdatingSlug || !newSlug || newSlug === slug}
                  onClick={() => updateSlug({ slug: newSlug })}
                >
                  {isUpdatingSlug ? '저장 중...' : '저장'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-10"
                  disabled={isUpdatingSlug}
                  onClick={() => { setEditingSlug(false); setNewSlug(slug) }}
                >
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={publicUrl ?? ''}
                readOnly
                className="flex-1 min-w-0 text-sm bg-muted cursor-default"
              />
              <Button type="button" size="icon" variant="outline" onClick={copyUrl}>
                <Copy className="h-4 w-4" />
              </Button>
              <a href={publicUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                <Button type="button" size="icon" variant="outline">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingSlug(true)}
              >
                변경
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {editingSlug
              ? '영어 소문자·숫자·하이픈만 쓸 수 있어요 (예: dartclean). 한글은 공유할 때 깨질 수 있어 막아뒀어요. 주소를 바꿔도 예전 주소로 들어오면 새 주소로 자동 연결돼 기존 링크는 안 깨져요.'
              : '이 링크를 카카오톡·블로그·SNS에 공유하면 AI 검색엔진이 업체를 인식합니다'}
          </p>
        </div>
      )}

      {/* 생성된 SEO 콘텐츠 미리보기 */}
      {(seoTitle || seoDesc || keywords) && (
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">생성된 AI 콘텐츠 미리보기</p>

          {seoTitle && (
            <div className="space-y-1">
              <Label className="text-xs">페이지 제목</Label>
              <p className="text-sm rounded bg-muted px-3 py-2">{seoTitle}</p>
            </div>
          )}

          {seoDesc && (
            <div className="space-y-1">
              <Label className="text-xs">검색 설명 (AI 인용 문장)</Label>
              <p className="text-sm rounded bg-muted px-3 py-2 leading-relaxed">{seoDesc}</p>
            </div>
          )}

          {keywords && (
            <div className="space-y-1">
              <Label className="text-xs">타겟 키워드</Label>
              <p className="text-sm rounded bg-muted px-3 py-2 text-muted-foreground">{keywords}</p>
            </div>
          )}

          {faqs.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">FAQ ({faqs.length}개)</Label>
              <div className="space-y-2">
                {faqs.map((faq, idx) => (
                  <div key={idx} className="rounded bg-muted px-3 py-2 text-sm">
                    <p className="font-medium">Q. {faq.question}</p>
                    <p className="text-muted-foreground mt-1">A. {faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {seoGeneratedAt && (
            <p className="text-xs text-muted-foreground text-right">
              마지막 생성: {new Date(seoGeneratedAt).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
      )}

      {!slug && !isGenerating && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <p>아직 공개 페이지가 없습니다.</p>
          <p className="mt-1">"AI로 생성하기" 버튼을 누르면 자동으로 만들어집니다.</p>
        </div>
      )}
    </div>
  )
}
