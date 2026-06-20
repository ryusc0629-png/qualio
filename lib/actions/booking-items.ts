'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { action } from '@/lib/safe-action'

// 공통 인증 — 로그인 + 업체 확인
async function getAuth() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) throw new Error('[APP] 로그인이 필요합니다')

  const db = createServiceClient()
  const { data: profile } = await db
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.business_id) throw new Error('[APP] 업체 정보를 찾을 수 없습니다')
  return { db, businessId: profile.business_id }
}

type DbClient = Awaited<ReturnType<typeof getAuth>>['db']

interface BookingItemRow {
  id: string
  booking_id: string
  name: string
  quantity: number
  unit_price: number
  amount: number
  unit: string
  sort_order: number
}

// 예약의 항목 합계로 bookings.final_price 동기화 (항목이 1개 이상일 때만)
async function syncBookingTotal(db: DbClient, businessId: string, bookingId: string) {
  const { data } = await db
    .from('booking_items' as never)
    .select('amount' as never)
    .eq('booking_id' as never, bookingId)
    .eq('business_id' as never, businessId) as { data: { amount: number }[] | null }

  const items = data ?? []
  if (items.length === 0) return // 항목이 없으면 기존 단일 금액 유지

  const total = items.reduce((s, it) => s + (it.amount ?? 0), 0)
  await db
    .from('bookings')
    .update({ final_price: total })
    .eq('id', bookingId)
    .eq('business_id', businessId)
}

// 변경 이력 기록
async function logChange(
  db: DbClient,
  businessId: string,
  bookingId: string,
  input: {
    change_type: 'add' | 'update' | 'remove'
    item_name: string | null
    old_amount: number | null
    new_amount: number | null
    reason?: string | null
  },
) {
  await db.from('booking_price_changes' as never).insert({
    business_id: businessId,
    booking_id: bookingId,
    changed_by: 'owner',
    change_type: input.change_type,
    item_name: input.item_name,
    old_amount: input.old_amount,
    new_amount: input.new_amount,
    reason: input.reason ?? null,
  } as never)
}

// 본인 업체 예약인지 확인
async function assertBookingOwned(db: DbClient, businessId: string, bookingId: string) {
  const { data } = await db
    .from('bookings')
    .select('id')
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!data) throw new Error('[APP] 예약을 찾을 수 없습니다')
}

// ── 조회 ────────────────────────────────────────────────
const getSchema = z.object({ bookingId: z.string().uuid() })

export const getBookingItemsAction = action
  .schema(getSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const [itemsRes, changesRes, servicesRes] = await Promise.all([
      db.from('booking_items' as never)
        .select('id, booking_id, name, quantity, unit_price, amount, unit, sort_order' as never)
        .eq('booking_id' as never, parsedInput.bookingId)
        .eq('business_id' as never, businessId)
        .order('sort_order' as never, { ascending: true }) as unknown as Promise<{ data: BookingItemRow[] | null }>,
      db.from('booking_price_changes' as never)
        .select('id, change_type, item_name, old_amount, new_amount, reason, changed_by, changed_by_name, created_at' as never)
        .eq('booking_id' as never, parsedInput.bookingId)
        .eq('business_id' as never, businessId)
        .order('created_at' as never, { ascending: false }) as unknown as Promise<{
          data: {
            id: string; change_type: string; item_name: string | null
            old_amount: number | null; new_amount: number | null; reason: string | null
            changed_by: string; changed_by_name: string | null; created_at: string
          }[] | null
        }>,
      db.from('service_items')
        .select('name, base_price, unit')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name', { ascending: true }) as unknown as Promise<{
          data: { name: string; base_price: number; unit: string }[] | null
        }>,
    ])

    // 서비스 이름 기준 중복 제거 (첫 항목 유지)
    const serviceMap = new Map<string, { base_price: number; unit: string }>()
    for (const s of servicesRes.data ?? []) {
      const name = (s.name ?? '').trim()
      if (name && !serviceMap.has(name)) serviceMap.set(name, { base_price: s.base_price ?? 0, unit: s.unit ?? '개' })
    }
    const services = [...serviceMap].map(([name, v]) => ({ name, base_price: v.base_price, unit: v.unit }))

    return { items: itemsRes.data ?? [], changes: changesRes.data ?? [], services }
  })

// ── 항목 추가 ───────────────────────────────────────────
const addSchema = z.object({
  bookingId: z.string().uuid(),
  name: z.string().min(1, '항목 이름을 입력해주세요'),
  quantity: z.coerce.number().int().min(1, '수량은 1 이상이어야 합니다'),
  unitPrice: z.coerce.number().int().min(0, '0 이상의 금액을 입력해주세요'),
  amount: z.coerce.number().int().min(0).optional(), // 합산 금액 직접 수정 시 우선
  unit: z.string().optional(),
  // 첫 항목 추가 시, 기존 단일 금액을 '기본' 항목으로 먼저 깔아 총액 보존 (버튼 없이 자동)
  seedBaseAmount: z.coerce.number().int().min(0).optional(),
})

export const addBookingItemAction = action
  .schema(addSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()
    await assertBookingOwned(db, businessId, parsedInput.bookingId)

    // 아직 항목이 없고 기존 단일 금액이 있으면, '기본 청소 서비스'를 먼저 깔아 총액을 보존한다.
    // (그냥 열어보기만 할 땐 아무것도 안 만들고, 실제로 첫 항목을 추가할 때만 동작)
    if (parsedInput.seedBaseAmount && parsedInput.seedBaseAmount > 0) {
      const { count } = await db
        .from('booking_items' as never)
        .select('id' as never, { count: 'exact', head: true })
        .eq('booking_id' as never, parsedInput.bookingId)
        .eq('business_id' as never, businessId) as unknown as { count: number | null }

      if ((count ?? 0) === 0) {
        await db.from('booking_items' as never).insert({
          business_id: businessId,
          booking_id: parsedInput.bookingId,
          name: '기본 청소 서비스',
          quantity: 1,
          unit_price: parsedInput.seedBaseAmount,
          amount: parsedInput.seedBaseAmount,
          unit: '정액',
          sort_order: 0,
        } as never)
        await logChange(db, businessId, parsedInput.bookingId, {
          change_type: 'add', item_name: '기본 청소 서비스', old_amount: null, new_amount: parsedInput.seedBaseAmount,
        })
      }
    }

    const amount = parsedInput.amount ?? parsedInput.quantity * parsedInput.unitPrice

    const { error } = await db.from('booking_items' as never).insert({
      business_id: businessId,
      booking_id: parsedInput.bookingId,
      name: parsedInput.name,
      quantity: parsedInput.quantity,
      unit_price: parsedInput.unitPrice,
      amount,
      unit: parsedInput.unit ?? '개',
      sort_order: Date.now() % 1000000,
    } as never)
    if (error) throw new Error('[APP] 항목 추가에 실패했습니다')

    await logChange(db, businessId, parsedInput.bookingId, {
      change_type: 'add', item_name: parsedInput.name, old_amount: null, new_amount: amount,
    })
    await syncBookingTotal(db, businessId, parsedInput.bookingId)

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/bookings')
    return { success: true }
  })

// ── 항목 수정 ───────────────────────────────────────────
const updateSchema = z.object({
  itemId: z.string().uuid(),
  bookingId: z.string().uuid(),
  name: z.string().min(1, '항목 이름을 입력해주세요'),
  quantity: z.coerce.number().int().min(1, '수량은 1 이상이어야 합니다'),
  unitPrice: z.coerce.number().int().min(0, '0 이상의 금액을 입력해주세요'),
  amount: z.coerce.number().int().min(0).optional(), // 합산 금액 직접 수정 시 우선
  unit: z.string().optional(),
})

export const updateBookingItemAction = action
  .schema(updateSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const { data: prev } = await db
      .from('booking_items' as never)
      .select('name, amount' as never)
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, businessId)
      .maybeSingle() as { data: { name: string; amount: number } | null }
    if (!prev) throw new Error('[APP] 항목을 찾을 수 없습니다')

    const amount = parsedInput.amount ?? parsedInput.quantity * parsedInput.unitPrice

    const { error } = await db
      .from('booking_items' as never)
      .update({
        name: parsedInput.name,
        quantity: parsedInput.quantity,
        unit_price: parsedInput.unitPrice,
        amount,
        ...(parsedInput.unit ? { unit: parsedInput.unit } : {}),
      } as never)
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, businessId)
    if (error) throw new Error('[APP] 항목 수정에 실패했습니다')

    await logChange(db, businessId, parsedInput.bookingId, {
      change_type: 'update', item_name: parsedInput.name, old_amount: prev.amount, new_amount: amount,
    })
    await syncBookingTotal(db, businessId, parsedInput.bookingId)

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/bookings')
    return { success: true }
  })

// ── 항목 삭제 ───────────────────────────────────────────
const deleteSchema = z.object({
  itemId: z.string().uuid(),
  bookingId: z.string().uuid(),
})

export const deleteBookingItemAction = action
  .schema(deleteSchema)
  .action(async ({ parsedInput }) => {
    const { db, businessId } = await getAuth()

    const { data: prev } = await db
      .from('booking_items' as never)
      .select('name, amount' as never)
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, businessId)
      .maybeSingle() as { data: { name: string; amount: number } | null }
    if (!prev) throw new Error('[APP] 항목을 찾을 수 없습니다')

    const { error } = await db
      .from('booking_items' as never)
      .delete()
      .eq('id' as never, parsedInput.itemId)
      .eq('business_id' as never, businessId)
    if (error) throw new Error('[APP] 항목 삭제에 실패했습니다')

    await logChange(db, businessId, parsedInput.bookingId, {
      change_type: 'remove', item_name: prev.name, old_amount: prev.amount, new_amount: null,
    })
    await syncBookingTotal(db, businessId, parsedInput.bookingId)

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard/bookings')
    return { success: true }
  })
