// 영업 동선 최적화 엔진 — 서버 전용
// 주소를 좌표로 바꾸고(지오코딩), 하루 방문량 기준으로 군집화한 뒤,
// 각 코스 내부를 최단 방문순서(최근접 + 2-opt)로 정렬한다.
// (KAKAO_REST_API_KEY 사용 — 'use server' 액션에서만 임포트되어 클라이언트로 노출되지 않음)

export interface RawStop {
  name: string
  address: string
  phone?: string
}

export interface GeoStop extends RawStop {
  lat: number
  lng: number
}

export interface Course {
  stops: GeoStop[]
  km: number
}

export interface LatLng {
  lat: number
  lng: number
}

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY

interface KakaoDoc {
  x: string
  y: string
}

async function kakaoGet(path: string): Promise<KakaoDoc[]> {
  if (!KAKAO_KEY) throw new Error('[APP] 지도 설정이 아직 안 됐어요. 잠시 후 다시 시도해주세요')
  const res = await fetch(`https://dapi.kakao.com${path}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  })
  if (!res.ok) return []
  const json = (await res.json()) as { documents?: KakaoDoc[] }
  return json.documents ?? []
}

// 주소검색 우선, 실패 시 상호명 키워드검색 폴백
async function geocodeOne(stop: RawStop): Promise<GeoStop | null> {
  const addr = stop.address.trim()
  if (addr) {
    const docs = await kakaoGet(`/v2/local/search/address.json?query=${encodeURIComponent(addr)}`)
    if (docs.length > 0) {
      return { ...stop, lat: parseFloat(docs[0].y), lng: parseFloat(docs[0].x) }
    }
  }
  const kw = `${stop.name} ${addr}`.trim()
  if (kw) {
    const docs = await kakaoGet(`/v2/local/search/keyword.json?query=${encodeURIComponent(kw)}`)
    if (docs.length > 0) {
      return { ...stop, lat: parseFloat(docs[0].y), lng: parseFloat(docs[0].x) }
    }
  }
  return null
}

// 동시성 제한 지오코딩 — 실패한 항목은 제외하고 성공만 반환
export async function geocodeMany(
  stops: RawStop[],
  concurrency = 8,
): Promise<{ ok: GeoStop[]; failed: RawStop[] }> {
  const ok: GeoStop[] = []
  const failed: RawStop[] = []
  let cursor = 0

  async function worker() {
    while (cursor < stops.length) {
      const i = cursor++
      try {
        const res = await geocodeOne(stops[i])
        if (res) ok.push(res)
        else failed.push(stops[i])
      } catch {
        failed.push(stops[i])
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, stops.length) }, worker))
  return { ok, failed }
}

// 지오코딩 단독 좌표 (출발지용)
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const docs = await kakaoGet(`/v2/local/search/address.json?query=${encodeURIComponent(address)}`)
  if (docs.length > 0) return { lat: parseFloat(docs[0].y), lng: parseFloat(docs[0].x) }
  return null
}

// 두 좌표 간 거리(km)
export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371
  const p1 = (a.lat * Math.PI) / 180
  const p2 = (b.lat * Math.PI) / 180
  const dp = ((b.lat - a.lat) * Math.PI) / 180
  const dl = ((b.lng - a.lng) * Math.PI) / 180
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// 간단 k-means (경도순 초기중심 → 재현성 위해 랜덤 미사용)
function kmeans(pts: LatLng[], k: number, iters = 40): number[] {
  const n = pts.length
  if (k >= n) return pts.map((_, i) => i)
  const order = [...pts.keys()].sort((a, b) => pts[a].lng - pts[b].lng || pts[a].lat - pts[b].lat)
  const cents: LatLng[] = Array.from({ length: k }, (_, j) => pts[order[Math.floor((j * n) / k)]])
  const labels = new Array<number>(n).fill(0)
  for (let it = 0; it < iters; it++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bd = Infinity
      for (let c = 0; c < k; c++) {
        const d = haversine(pts[i], cents[c])
        if (d < bd) {
          bd = d
          best = c
        }
      }
      if (labels[i] !== best) {
        labels[i] = best
        changed = true
      }
    }
    for (let c = 0; c < k; c++) {
      const grp = pts.filter((_, i) => labels[i] === c)
      if (grp.length > 0) {
        cents[c] = {
          lat: grp.reduce((s, p) => s + p.lat, 0) / grp.length,
          lng: grp.reduce((s, p) => s + p.lng, 0) / grp.length,
        }
      }
    }
    if (!changed) break
  }
  return labels
}

function nearestNeighbor(pts: LatLng[], start = 0): number[] {
  const n = pts.length
  const unvisited = new Set<number>([...pts.keys()])
  unvisited.delete(start)
  const tour = [start]
  let cur = start
  while (unvisited.size > 0) {
    let nxt = -1
    let bd = Infinity
    for (const j of unvisited) {
      const d = haversine(pts[cur], pts[j])
      if (d < bd) {
        bd = d
        nxt = j
      }
    }
    tour.push(nxt)
    unvisited.delete(nxt)
    cur = nxt
  }
  return tour
}

function twoOpt(pts: LatLng[], tour: number[], rounds = 60): number[] {
  const n = tour.length
  let improved = true
  let r = 0
  while (improved && r < rounds) {
    improved = false
    r++
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue
        const a = tour[i]
        const b = tour[i + 1]
        const c = tour[j]
        const e = tour[(j + 1) % n]
        const before = haversine(pts[a], pts[b]) + haversine(pts[c], pts[e])
        const after = haversine(pts[a], pts[c]) + haversine(pts[b], pts[e])
        if (after + 1e-9 < before) {
          let lo = i + 1
          let hi = j
          while (lo < hi) {
            ;[tour[lo], tour[hi]] = [tour[hi], tour[lo]]
            lo++
            hi--
          }
          improved = true
        }
      }
    }
  }
  return tour
}

function tourLen(pts: LatLng[], tour: number[]): number {
  let sum = 0
  for (let i = 0; i < tour.length - 1; i++) sum += haversine(pts[tour[i]], pts[tour[i + 1]])
  return sum
}

// 한 군집 내부를 최단 순서로 정렬. start가 있으면 그 지점에서 가장 가깝게 시작.
function optimizeGroup(group: GeoStop[], start?: LatLng): { ordered: GeoStop[]; km: number } {
  if (group.length <= 1) return { ordered: group, km: 0 }
  if (start) {
    const all: LatLng[] = [start, ...group]
    let tour = nearestNeighbor(all, 0)
    tour = twoOpt(all, tour)
    const ordered = tour.filter((i) => i !== 0).map((i) => group[i - 1])
    return { ordered, km: tourLen(all, tour) }
  }
  let tour = nearestNeighbor(group, 0)
  tour = twoOpt(group, tour)
  return { ordered: tour.map((i) => group[i]), km: tourLen(group, tour) }
}

// 전체 파이프라인: 하루 방문량으로 코스 분할 + 각 코스 최적화 + 코스 순서 정렬
export function buildCourses(stops: GeoStop[], perDay: number, start?: LatLng | null): Course[] {
  if (stops.length === 0) return []
  const k = Math.max(1, Math.ceil(stops.length / Math.max(1, perDay)))
  const labels = kmeans(stops, k)
  const clusters = new Map<number, GeoStop[]>()
  labels.forEach((lb, i) => {
    const arr = clusters.get(lb) ?? []
    arr.push(stops[i])
    clusters.set(lb, arr)
  })

  const courses = [...clusters.values()].map((grp) => {
    const cen: LatLng = {
      lat: grp.reduce((s, p) => s + p.lat, 0) / grp.length,
      lng: grp.reduce((s, p) => s + p.lng, 0) / grp.length,
    }
    return { grp, cen }
  })

  // 코스 순서: 출발지 있으면 가까운 순, 없으면 서→동
  courses.sort((a, b) =>
    start ? haversine(start, a.cen) - haversine(start, b.cen) : a.cen.lng - b.cen.lng,
  )

  return courses.map(({ grp }, idx) => {
    const { ordered, km } = optimizeGroup(grp, idx === 0 ? start ?? undefined : undefined)
    return { stops: ordered, km }
  })
}
