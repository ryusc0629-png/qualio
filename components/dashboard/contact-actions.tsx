import { Phone, MessageSquare, Mail } from 'lucide-react'
import { MapNavButton } from '@/components/dashboard/map-nav-button'

// 고객 전화번호·이메일·주소를 "탭 한 번"으로 쓰게 해주는 바로가기.
// - 전화번호: 탭 → 전화 / 문자 (순수 a 태그, 서버 컴포넌트에서도 동작)
// - 이메일: 탭 → 메일 보내기
// - 주소: 카카오맵/네이버맵/티맵 중 골라서 길찾기 (MapNavButton)

interface ContactActionsProps {
  phone?: string | null
  email?: string | null
  address?: string | null
}

export function ContactActions({ phone, email, address }: ContactActionsProps) {
  if (!phone && !email && !address) return null

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

      {email && (
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 h-11 text-sm font-medium active:bg-muted transition-colors"
        >
          <Mail className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{email}</span>
        </a>
      )}

      {address && <MapNavButton address={address} />}
    </div>
  )
}
