'use client'

import type { ReactNode } from 'react'
import { trackFunnel } from '@/lib/utils/track-funnel'

interface PhoneCallLinkProps {
  businessId: string
  phone: string
  /** 페이지 안 어디에 있는 버튼인지 — 어느 위치가 전화를 부르는지 구분용 */
  placement: 'header' | 'hero' | 'hero_text' | 'bottom_cta' | 'mobile_bar' | 'post' | 'quote'
  className?: string
  children: ReactNode
}

/**
 * 전화 버튼 — 누른 순간을 기록하고 바로 전화 앱으로 연결한다.
 *
 * 문의 폼과 달리 전화는 손님이 말해주지 않으면 어디서 왔는지 알 수 없었다.
 * 이 컴포넌트가 '전화 버튼 누름'을 유입 채널(?ch=)과 함께 남겨,
 * 어느 채널이 전화를 부르는지 대시보드에서 보이게 한다.
 *
 * 주의: 누른 것과 실제 통화는 다르다(PC에선 눌러도 전화가 안 걸림).
 * 그래서 대시보드에서도 '문의'가 아니라 '전화 버튼 누름'으로 표시한다.
 */
export function PhoneCallLink({ businessId, phone, placement, className, children }: PhoneCallLinkProps) {
  return (
    <a
      href={`tel:${phone}`}
      className={className}
      onClick={() => trackFunnel(businessId, 'phone_click', { step: placement })}
    >
      {children}
    </a>
  )
}
