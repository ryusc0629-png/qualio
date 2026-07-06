import { createServiceClient } from '@/lib/supabase/server'
import type { Lesson } from '@/lib/types/lesson'

// OPS 강의 조회 헬퍼 — 모두 서버(service_role)에서만 호출한다.

// 공개된 강의만, 순서대로 (고객용 배움터 페이지)
export async function getPublishedLessons(): Promise<Lesson[]> {
  const db = createServiceClient()
  const { data } = await db
    .from('ops_lessons')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
  return data ?? []
}

// 전체 강의 (관리자용 — 초안 포함)
export async function getAllLessons(): Promise<Lesson[]> {
  const db = createServiceClient()
  const { data } = await db
    .from('ops_lessons')
    .select('*')
    .order('sort_order', { ascending: true })
  return data ?? []
}

// 단일 강의
export async function getLessonById(id: string): Promise<Lesson | null> {
  const db = createServiceClient()
  const { data } = await db
    .from('ops_lessons')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data
}
