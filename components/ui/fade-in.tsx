'use client'

import { useEffect, useRef } from 'react'

interface Props {
  children: React.ReactNode
  delay?: number       // ms 단위 지연 (stagger용)
  className?: string
  direction?: 'up' | 'left'
}

export function FadeIn({ children, delay = 0, className = '', direction = 'up' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setTimeout(() => {
          el.style.opacity = '1'
          el.style.transform = 'translate3d(0,0,0)'
        }, delay)
        observer.disconnect()
      },
      { threshold: 0.12 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])

  const initial = direction === 'left'
    ? 'translate3d(-24px,0,0)'
    : 'translate3d(0,24px,0)'

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: 0,
        transform: initial,
        transition: 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)',
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}
