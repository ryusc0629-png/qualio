// 고객이 보는 공개 화면(견적 문의·견적 제안·영수증)의 업체 아이콘.
//
// 우선순위는 홈페이지 파비콘(app/biz/[slug]/favicon/route.ts)과 동일하게 맞춘다 —
// 업체가 올린 파비콘 → 로고 → 업체명 첫 글자.
// 세 화면이 각자 첫 글자만 그리고 있어, 로고를 올린 업체도 고객 화면에선 글자만 보였다.
interface Props {
  name: string
  logoUrl?: string | null
  faviconUrl?: string | null
  /** 지름 — 기본 32px(h-8 w-8) */
  className?: string
}

export function BusinessAvatar({ name, logoUrl, faviconUrl, className = 'w-8 h-8' }: Props) {
  const src = faviconUrl || logoUrl

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${className} rounded-full object-contain bg-white border border-border shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${className} rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0`}
    >
      {name.trim().slice(0, 1)}
    </div>
  )
}
