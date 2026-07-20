'use server'

import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import {
  geocodeMany,
  geocodeAddress,
  buildCourses,
  type RawStop,
  type GeoStop,
} from '@/lib/roadmap/geo'

// 로그인 확인 (남용 방지 — 지도 API 호출 게이트)
async function requireAuth() {
  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) throw new Error('[APP] 로그인이 필요합니다')
  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')
  return { businessId: profile.business_id }
}

const MAX_STOPS = 400

const buildRoadmapSchema = z.object({
  stops: z
    .array(
      z.object({
        name: z.string().min(1),
        address: z.string(),
        phone: z.string().optional(),
      }),
    )
    .min(1, '방문할 곳을 한 곳 이상 넣어주세요')
    .max(MAX_STOPS, `한 번에 최대 ${MAX_STOPS}곳까지 계산할 수 있어요`),
  perDay: z.number().int().min(1).max(100),
  startAddress: z.string().optional(),
})

export const buildRoadmapAction = action
  .schema(buildRoadmapSchema)
  .action(async ({ parsedInput }) => {
    await requireAuth()

    const rawStops: RawStop[] = parsedInput.stops.map((s) => ({
      name: s.name.trim(),
      address: s.address.trim(),
      phone: s.phone?.trim() || undefined,
    }))

    const start = parsedInput.startAddress?.trim()
      ? await geocodeAddress(parsedInput.startAddress.trim())
      : null

    const { ok, failed } = await geocodeMany(rawStops)

    if (ok.length === 0) {
      throw new Error('[APP] 주소를 좌표로 못 바꿨어요. 주소를 다시 확인해주세요')
    }

    const courses = buildCourses(ok, parsedInput.perDay, start)

    return {
      success: true,
      courses,
      geocodedCount: ok.length,
      failedCount: failed.length,
      failedNames: failed.slice(0, 20).map((f) => f.name),
      totalKm: courses.reduce((s, c) => s + c.km, 0),
    }
  })

// ── 지역+업종 자동 명단 (공공데이터 상가정보 기반) ──────────────

// database.ts 타입에 아직 없는 RPC 호출용 (any 금지 → unknown 캐스팅)
type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>

function rpcClient() {
  const db = createServiceClient()
  return db.rpc.bind(db) as unknown as RpcFn
}

// 선택한 시도의 시군구 목록 (데이터 있는 것만)
const sigunguSchema = z.object({ sido: z.string().min(1) })

export const listSigunguAction = action.schema(sigunguSchema).action(async ({ parsedInput }) => {
  await requireAuth()
  const { data, error } = await rpcClient()('prospect_sigungu_list', { p_sido: parsedInput.sido })
  if (error) throw new Error('[APP] 지역 목록을 못 불러왔어요')
  const list = (data ?? []) as { sigungu: string; cnt: number }[]
  return { sigungu: list.map((r) => r.sigungu) }
})

// 지역+업종 자동 모드는 이미 좌표가 있어 한 번에 더 많이 처리 가능 (시 전체/시도 전체)
const DIRECTORY_MAX = 1500

// 지역+업종 → 방문 대상 조회 → 동선 코스 생성 (좌표가 이미 있어 지오코딩 불필요)
const directorySchema = z.object({
  sido: z.string().min(1, '지역을 골라주세요'),
  sigungu: z.string().optional(), // 비우면 시도 전체, '창원시'면 창원 전체 구
  keyword: z.string().optional(),
  perDay: z.number().int().min(1).max(100),
  startAddress: z.string().optional(),
})

interface ProspectRow {
  name: string
  address: string | null
  lat: number
  lng: number
}

export const buildDirectoryRoadmapAction = action
  .schema(directorySchema)
  .action(async ({ parsedInput }) => {
    await requireAuth()

    const { data, error } = await rpcClient()('prospect_search', {
      p_sido: parsedInput.sido,
      p_sigungu: parsedInput.sigungu?.trim() || null,
      p_keyword: parsedInput.keyword?.trim() || null,
      p_limit: DIRECTORY_MAX,
    })
    if (error) throw new Error('[APP] 명단을 못 불러왔어요. 잠시 후 다시 시도해주세요')

    const rows = (data ?? []) as ProspectRow[]
    const stops: GeoStop[] = rows.map((r) => ({
      name: r.name,
      address: r.address ?? '',
      lat: r.lat,
      lng: r.lng,
    }))

    if (stops.length === 0) {
      throw new Error('[APP] 그 지역에 해당하는 업체가 없어요. 업종 키워드를 바꿔보세요')
    }

    const start = parsedInput.startAddress?.trim()
      ? await geocodeAddress(parsedInput.startAddress.trim())
      : null

    const courses = buildCourses(stops, parsedInput.perDay, start)

    return {
      success: true,
      courses,
      geocodedCount: stops.length,
      failedCount: 0,
      failedNames: [] as string[],
      totalKm: courses.reduce((s, c) => s + c.km, 0),
      capped: stops.length >= DIRECTORY_MAX,
    }
  })
