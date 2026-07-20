'use server'

import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'
import { geocodeMany, geocodeAddress, buildCourses, type RawStop } from '@/lib/roadmap/geo'

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
