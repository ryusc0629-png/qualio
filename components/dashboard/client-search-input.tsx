'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

export function ClientSearchInput() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // URL 검색어와 동기화
  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
  }, [searchParams])

  const updateUrl = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value.trim()) {
      params.set('q', value.trim())
    } else {
      params.delete('q')
    }
    const qs = params.toString()
    router.replace(`/dashboard/clients${qs ? '?' + qs : ''}`)
  }

  const handleChange = (value: string) => {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => updateUrl(value), 300)
  }

  const handleClear = () => {
    setQuery('')
    updateUrl('')
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="고객 이름으로 검색"
        className="w-full h-10 rounded-lg border border-border bg-background pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
