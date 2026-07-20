'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateGeoContentAction, updateSlugAction, updateGeoKeywordsAction } from '@/lib/actions/geo'
import { Sparkles, Copy, ExternalLink, RefreshCw, ListPlus, Check } from 'lucide-react'
import Link from 'next/link'

interface FaqItem {
  question: string
  answer: string
}

interface Props {
  businessId: string
  businessName?: string | null
  serviceCount: number   // 등록된 활성 서비스 수 — 0개면 AI 생성을 막아 추측성 글 방지
  hasAddress: boolean    // 업체 지역(주소) 입력 여부 — 지역 GEO 최적화에 필수
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
  serviceCount,
  hasAddress,
  slug: initialSlug,
  seoTitle: initialTitle,
  seoDescription: initialDescription,
  seoKeywords: initialKeywords,
  seoFaqs: initialFaqs,
  seoGeneratedAt,
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://qualio.co.kr'
  const suggestedSlug = slugify(businessName ?? '')
  // 서비스·지역(주소)이 모두 있어야 팩트 기반 생성이 가능 — 하나라도 없으면 막는다
  const hasServices = serviceCount > 0
  const canGenerate = hasServices && hasAddress

  const [slug, setSlug]               = useState(initialSlug ?? '')
  const [editingSlug, setEditingSlug] = useState(false)
  const [newSlug, setNewSlug]         = useState(initialSlug ?? '')
  const [seoTitle, setSeoTitle]       = useState(initialTitle ?? '')
  const [seoDesc, setSeoDesc]         = useState(initialDescription ?? '')
  const [keywords, setKeywords]       = useState(initialKeywords ?? '')
  const [faqs, setFaqs]               = useState<FaqItem[]>(initialFaqs)

  // 검색 키워드 직접 수정
  const [editingKeywords, setEditingKeywords] = useState(false)
  const [draftKeywords, setDraftKeywords]     = useState(initialKeywords ?? '')

  const publicUrl = slug ? `${appUrl}/biz/${slug}` : null

  // 실제로 홍보 페이지 내용을 만든 적이 있는지 — slug 유무가 아니라 생성 기록/제목으로 판단
  // (slug는 저장 시 자동 생성돼 있을 수 있어, slug로 판단하면 생성 전인데 '재생성'으로 잘못 뜸)
  const hasGenerated = !!seoGeneratedAt || !!seoTitle

  // AI GEO 콘텐츠 생성
  const router = useRouter()

  const { execute: generate, isPending: isGenerating } = useAction(generateGeoContentAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      setSlug(data.slug)
      setNewSlug(data.slug)
      setSeoTitle(data.geoContent.seoTitle)
      setSeoDesc(data.geoContent.seoDescription)
      setKeywords(data.geoContent.seoKeywords)
      setDraftKeywords(data.geoContent.seoKeywords)
      setEditingKeywords(false)
      setFaqs(data.geoContent.faqs)
      toast.success('GEO 콘텐츠가 생성되었습니다!')
      // 생성 완료 → 설정 페이지 서버 데이터 새로고침(seo_generated_at 갱신)
      // → 미리보기 체크리스트의 '홍보 페이지 내용 만들기'가 즉시 ✅로 바뀜
      router.refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'GEO 콘텐츠 생성에 실패했습니다'),
  })

  // 검색 키워드 저장
  const { execute: saveKeywords, isPending: isSavingKeywords } = useAction(updateGeoKeywordsAction, {
    onSuccess: ({ data }) => {
      if (data?.keywords) setKeywords(data.keywords)
      setEditingKeywords(false)
      toast.success('검색 키워드를 저장했어요')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요'),
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
            ChatGPT·Gemini·Perplexity에 인용되는 업체 페이지를 자동 생성합니다
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => generate({})}
          disabled={isGenerating || !canGenerate}
          className="gap-2 shrink-0"
        >
          {isGenerating ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isGenerating ? '생성 중...' : (hasGenerated ? '재생성' : '생성하기')}
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

              {/* 저장 / 취소 — 버튼 행 (저장이 주 액션, 취소는 보조) */}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  className="flex-[2] h-12 text-base font-semibold"
                  disabled={isUpdatingSlug || !newSlug || newSlug === slug}
                  onClick={() => updateSlug({ slug: newSlug })}
                >
                  {isUpdatingSlug ? '저장 중...' : '저장하기'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 h-12 text-muted-foreground"
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
          <p className="text-xs font-medium text-muted-foreground">생성된 콘텐츠 미리보기</p>

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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">검색 키워드</Label>
                {!editingKeywords && (
                  <button
                    type="button"
                    onClick={() => { setDraftKeywords(keywords); setEditingKeywords(true) }}
                    className="text-xs text-primary hover:underline"
                  >
                    수정
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                고객이 검색할 때 쓰는 말이에요. 자동으로 채워주고, 직접 고칠 수도 있어요. (쉼표로 구분)
              </p>
              {editingKeywords ? (
                <div className="space-y-2">
                  <textarea
                    value={draftKeywords}
                    onChange={(e) => setDraftKeywords(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="예: 강남 입주청소, 서초 정기청소, 역삼동 에어컨청소"
                    className="w-full text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9"
                      disabled={isSavingKeywords || !draftKeywords.trim() || draftKeywords.trim() === keywords}
                      onClick={() => saveKeywords({ keywords: draftKeywords.trim() })}
                    >
                      {isSavingKeywords ? '저장 중...' : '저장하기'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 text-muted-foreground"
                      disabled={isSavingKeywords}
                      onClick={() => { setEditingKeywords(false); setDraftKeywords(keywords) }}
                    >
                      취소
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm rounded bg-muted px-3 py-2 text-muted-foreground">{keywords}</p>
              )}
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

      {/* 준비가 안 됐으면 — 무엇을 채워야 하는지 안내 (추측 대신 팩트 기반 생성) */}
      {!canGenerate && !isGenerating && (
        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-5 space-y-3">
          <p className="text-sm font-medium">
            아래를 먼저 채우면 더 정확한 홍보 페이지를 만들어 드려요
          </p>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-start gap-2">
              <Check className={`h-4 w-4 mt-0.5 shrink-0 ${hasServices ? 'text-primary' : 'text-muted-foreground/40'}`} />
              <div className="flex-1">
                <span className={hasServices ? 'line-through text-muted-foreground' : ''}>
                  서비스와 가격 등록
                </span>
                {!hasServices && (
                  <Link href="/dashboard/services" className="block mt-1">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 h-9">
                      <ListPlus className="h-4 w-4" />
                      서비스 등록하러 가기
                    </Button>
                  </Link>
                )}
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Check className={`h-4 w-4 mt-0.5 shrink-0 ${hasAddress ? 'text-primary' : 'text-muted-foreground/40'}`} />
              <div className="flex-1">
                <span className={hasAddress ? 'line-through text-muted-foreground' : ''}>
                  업체 지역(주소) 입력
                </span>
                {!hasAddress && (
                  <p className="text-xs text-muted-foreground mt-1">
                    아래 <span className="font-medium text-foreground">업체 정보</span>에서 주소를 입력해 주세요. 지역 검색 노출에 꼭 필요해요.
                  </p>
                )}
              </div>
            </li>
          </ul>
        </div>
      )}

      {/* 준비는 됐는데 아직 생성 전 — 다음에 뭘 눌러야 하는지 크게 안내 */}
      {canGenerate && !hasGenerated && !isGenerating && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            마지막 한 단계만 남았어요!
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            오른쪽 위 <span className="font-semibold text-primary">&quot;생성하기&quot;</span> 버튼을 누르면
            자주 묻는 질문·검색 소개글이 자동으로 채워져 홍보 페이지가 완성돼요.
          </p>
          <Button
            type="button"
            onClick={() => generate({})}
            className="w-full h-11 gap-2 mt-1 font-bold"
          >
            <Sparkles className="h-4 w-4" />
            지금 홍보 페이지 만들기
          </Button>
        </div>
      )}
    </div>
  )
}
