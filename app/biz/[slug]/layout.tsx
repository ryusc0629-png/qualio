import type { Metadata } from 'next'
import { isDomainIdentifier } from '@/lib/domains/resolve'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

/**
 * 홍보 페이지(하위 글 목록·상세 포함)의 브라우저 탭 아이콘을 그 업체 것으로 지정한다.
 * 여기서 정해두지 않으면 퀄리오 아이콘이 그대로 노출된다(네이버 검색 결과에도 그대로 보임).
 *
 * 자체 도메인으로 들어온 요청은 [slug] 자리에 도메인이 들어온다(proxy rewrite).
 * 이때는 같은 도메인의 /favicon 을 가리켜야 크롤러가 리디렉트 없이 바로 받아간다.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = rawSlug.normalize('NFC')
  const href = isDomainIdentifier(slug) ? '/favicon' : `/biz/${slug}/favicon`

  return {
    icons: {
      icon: [{ url: href }],
      shortcut: [{ url: href }],
      apple: [{ url: href }],
    },
  }
}

export default function BizSlugLayout({ children }: Props) {
  return children
}
