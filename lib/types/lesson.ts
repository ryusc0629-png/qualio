import type { Database } from '@/lib/types/database'

// OPS 영상 교육 강의 한 건 — database.ts의 ops_lessons Row에서 파생
export type Lesson = Database['public']['Tables']['ops_lessons']['Row']
