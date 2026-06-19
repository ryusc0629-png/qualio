import { createClient as createRawClient } from '@supabase/supabase-js'

// database.ts 타입에 아직 반영되지 않은 신규 테이블(지표 스냅샷·결제 퍼널 등)에
// 접근하기 위한 제네릭 없는 service_role 클라이언트.
//
// 왜 분리하는가:
//   타입이 있는 createServiceClient<Database>는 새 테이블명을 받지 못해 컴파일 에러가 난다.
//   여기서는 제네릭 없이 접근하고, 호출부에서 결과를 명시 타입으로 단언한다.
//   서버 전용 — 절대 클라이언트/브라우저에 노출 금지.
export function createInternalClient() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
