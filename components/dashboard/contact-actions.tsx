import { Phone, MessageSquare, MapPin, Navigation } from 'lucide-react'

// 고객 전화번호·주소를 "탭 한 번"으로 쓰게 해주는 바로가기.
// - 전화번호: 탭 → 전화 / 문자
// - 주소: 탭 → 네이버 지도에서 길찾기 (현장앱과 동일 방식)
// 순수 링크(a 태그)라 별도 JS 불필요 → 서버 컴포넌트에서도 그대로 사용 가능.

interface ContactActionsProps {
  phone?: string | null
  address?: string | null
}

export function ContactActions({ phone, address }: ContactActionsProps) {
  if (!phone && !address) return null

  return (
    <div className="space-y-2">
      {phone && (
        <div className="flex items-center gap-2">
          <a
            href={`tel:${phone}`}
            className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 h-11 text-sm font-medium active:bg-muted transition-colors"
          >
            <Phone className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{phone}</span>
          </a>
          <a
            href={`sms:${phone}`}
            aria-label="문자 보내기"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 h-11 text-sm font-medium text-muted-foreground active:bg-muted transition-colors shrink-0"
          >
            <MessageSquare className="h-4 w-4" />
            문자
          </a>
        </div>
      )}

      {address && (
        <a
          href={`https://map.naver.com/v5/search/${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 h-11 text-sm active:bg-muted transition-colors"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 truncate font-medium">{address}</span>
          <span className="flex items-center gap-1 text-xs font-semibold text-primary shrink-0">
            <Navigation className="h-3.5 w-3.5" />
            길찾기
          </span>
        </a>
      )}
    </div>
  )
}
