// 주소 한 줄 형식 유틸 — 기본 주소(도로명/지번)와 상세 주소(동·호수·층)를 하나의 문자열로 다룬다.
// 저장 형식: "울산 남구 삼산로 123 — 101동 1234호"
// 서버(Server Action)와 클라이언트 양쪽에서 써야 하므로 'use client' 컴포넌트가 아닌 여기에 둔다.

export const ADDRESS_SEPARATOR = ' — '

/** 저장된 주소 한 줄을 기본 주소 / 상세 주소로 나눈다. */
export function splitAddress(full?: string | null): { base: string; detail: string } {
  const v = full ?? ''
  const i = v.indexOf(ADDRESS_SEPARATOR)
  if (i === -1) return { base: v, detail: '' }
  return { base: v.slice(0, i), detail: v.slice(i + ADDRESS_SEPARATOR.length) }
}

/** 기본 주소와 상세 주소를 한 줄로 합친다. 상세가 비면 기본 주소만 남긴다. */
export function joinAddress(base: string, detail: string): string {
  return detail.trim() ? `${base}${ADDRESS_SEPARATOR}${detail}` : base
}

/**
 * 거래처·고객에 저장된 주소를, 견적서 현장 주소에서 알아낸 상세 주소로 보강한다.
 * 같은 건물일 때만(기본 주소가 동일) 상세를 이어받아, 본사와 현장이 다른 경우를 덮어쓰지 않는다.
 * 보강할 게 없으면 null을 돌려준다(= DB를 건드리지 않음).
 */
export function mergeAddressDetail(current: string | null | undefined, incoming: string | null | undefined): string | null {
  const next = (incoming ?? '').trim()
  if (!next) return null

  const cur = (current ?? '').trim()
  if (!cur) return next // 주소가 아예 없으면 현장 주소를 그대로 채운다

  const a = splitAddress(cur)
  const b = splitAddress(next)
  if (a.base !== b.base) return null // 다른 장소 — 건드리지 않는다
  if (!b.detail || a.detail) return null // 이어받을 상세가 없거나 이미 적혀 있음

  return joinAddress(a.base, b.detail)
}
