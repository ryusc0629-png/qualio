'use client'

import { useMemo, useState } from 'react'
import type { CsBusinessRow } from '@/lib/admin/businesses-list'
import { formatDate } from '@/lib/format/datetime'

// 전화번호 정규화(검색용) — 하이픈·공백 제거
function normalizePhone(v: string | null): string {
  return (v ?? '').replace(/[^0-9]/g, '')
}

export function BusinessesList({ rows }: { rows: CsBusinessRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    const qDigits = q.replace(/[^0-9]/g, '')
    return rows.filter((r) => {
      const haystack = [r.name, r.ownerName, r.ownerEmail, r.address, r.planLabel, r.acquisitionLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const phoneMatch = qDigits.length > 0 && normalizePhone(r.phone).includes(qDigits)
      return haystack.includes(q) || phoneMatch
    })
  }, [rows, query])

  return (
    <div>
      {/* 검색창 — 업체명·대표자·전화·이메일로 바로 찾기 */}
      <div className="mb-4">
        <input
          type="search"
          inputMode="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="업체명·대표자·전화번호·이메일로 검색 (예: 다트클린, 010-1234-5678)"
          className="h-12 w-full rounded-lg border bg-background px-4 text-sm outline-none focus:border-emerald-400"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          총 {rows.length}곳 · 검색 결과 {filtered.length}곳
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed bg-background py-12 text-center">
          <p className="text-sm text-muted-foreground">검색과 일치하는 업체가 없어요</p>
          <p className="text-xs text-muted-foreground">이름 일부나 전화 뒷자리로 다시 찾아보세요</p>
        </div>
      ) : (
        // 모바일=카드 목록 / 데스크탑=테이블
        <>
          {/* 모바일 카드 */}
          <div className="space-y-3 md:hidden">
            {filtered.map((r) => (
              <div key={r.businessId} className="rounded-lg border bg-background p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.ownerName ?? '대표자명 없음'}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      r.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {r.planLabel} · {r.subStatusLabel}
                  </span>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">연락처</dt>
                    <dd>
                      {r.phone ? (
                        <a href={`tel:${normalizePhone(r.phone)}`} className="text-emerald-700 underline">
                          {r.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">없음</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">이메일</dt>
                    <dd className="truncate text-right">{r.ownerEmail ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">가입일</dt>
                    <dd>
                      {formatDate(r.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })} · {r.acquisitionLabel}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">활동</dt>
                    <dd>
                      예약 {r.bookingCount} · 리드 {r.leadCount}
                      {r.lastActivityAt
                        ? ` · 최근 ${formatDate(r.lastActivityAt, { month: 'long', day: 'numeric' })}`
                        : ' · 활동 없음'}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          {/* 데스크탑 테이블 */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">업체명 / 대표자</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium">이메일</th>
                  <th className="px-3 py-2 font-medium">플랜 / 상태</th>
                  <th className="px-3 py-2 font-medium">가입일 / 경로</th>
                  <th className="px-3 py-2 font-medium">활동</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.businessId} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.ownerName ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.phone ? (
                        <a href={`tel:${normalizePhone(r.phone)}`} className="text-emerald-700 underline">
                          {r.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs">{r.ownerEmail ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          r.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {r.planLabel}
                      </span>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{r.subStatusLabel}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {formatDate(r.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })}
                      <p className="text-muted-foreground">{r.acquisitionLabel}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      예약 {r.bookingCount} · 리드 {r.leadCount}
                      <p className="text-muted-foreground">
                        {r.lastActivityAt
                          ? `최근 ${formatDate(r.lastActivityAt, { month: 'long', day: 'numeric' })}`
                          : '활동 없음'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
