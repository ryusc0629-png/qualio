'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
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

// ── 짠 코스 서버 저장 (폰·PC 어느 기기에서든 같은 코스가 보이도록) ──────────────
// 업체당 마지막으로 짠 코스 1개만 유지(다시 짜면 덮어씀). database.ts 타입엔 아직 없어 as never 캐스팅.

const geoStopSchema = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
})

const roadmapResultSchema = z.object({
  courses: z.array(z.object({ stops: z.array(geoStopSchema), km: z.number() })),
  geocodedCount: z.number(),
  failedCount: z.number(),
  failedNames: z.array(z.string()),
  totalKm: z.number(),
  capped: z.boolean().optional(),
})

const saveRoadmapSchema = z.object({
  summary: z.string(),
  savedAt: z.number(),
  result: roadmapResultSchema,
})

// database.ts 타입에 아직 없는 테이블 → 느슨한 클라이언트로 접근(다른 신규 테이블과 동일 패턴)
function looseDb(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}

export const saveRoadmapAction = action.schema(saveRoadmapSchema).action(async ({ parsedInput }) => {
  const { businessId } = await requireAuth()
  const { error } = await looseDb()
    .from('business_roadmaps')
    .upsert(
      {
        business_id: businessId,
        summary: parsedInput.summary,
        result: parsedInput.result,
        saved_at: new Date(parsedInput.savedAt).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' },
    )
  if (error) {
    console.error('[Roadmap] 저장 오류:', error)
    throw new Error('[APP] 코스를 저장 못 했어요. 다시 시도해주세요')
  }
  return { success: true }
})

export const clearRoadmapAction = action.schema(z.object({})).action(async () => {
  const { businessId } = await requireAuth()
  const { error } = await looseDb().from('business_roadmaps').delete().eq('business_id', businessId)
  if (error) {
    console.error('[Roadmap] 삭제 오류:', error)
    throw new Error('[APP] 코스를 지우지 못했어요. 다시 시도해주세요')
  }
  return { success: true }
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

// 지역+업종 자동 모드 상한. Supabase(PostgREST) 기본 응답이 1000행이라 그에 맞춤.
// (1000곳이면 이미 40일 코스라 실무상 충분. 더 완전히 보려면 구·군 단위로 좁히면 됨)
const DIRECTORY_MAX = 1000

// 타겟 업종은 고정 선택 (공장=전국등록공장현황 데이터 기반)
const TARGETS = ['인테리어', '병의원', '학원', '공장']

// 지역+타겟 → 방문 대상 조회 → 동선 코스 생성 (좌표가 이미 있어 지오코딩 불필요)
const directorySchema = z.object({
  sido: z.string().min(1, '지역을 골라주세요'),
  sigungu: z.string().optional(), // 비우면 시도 전체, '창원시'면 창원 전체 구
  target: z.string().refine((v) => TARGETS.includes(v), '업종을 골라주세요'),
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
      p_target: parsedInput.target,
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
      throw new Error('[APP] 그 지역엔 해당 업종 업체가 없어요. 지역이나 업종을 바꿔보세요')
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
