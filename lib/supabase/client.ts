import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

// 브라우저(클라이언트 컴포넌트)에서 Supabase에 접근할 때 사용
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
