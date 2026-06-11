@AGENTS.md

# 퀄리오 (Qualio) — Claude Code 하네스 설정

## 프로젝트 개요
한국형 청소/홈케어 업체 B2B SaaS. Jobber/Housecall Pro 한국판.
청소업체가 견적→예약→결제→알림톡→리뷰까지 자동화할 수 있는 운영 도구.

---

## 자동 오류 수정 루프 규칙
코드를 수정한 후 반드시 아래 절차를 따를 것:

1. `npx tsc --noEmit` 실행하여 TypeScript 오류 확인
2. 오류가 있으면 수정 후 다시 확인 — **최대 5회 반복**
3. 오류가 없으면 즉시 종료 (5회를 채울 필요 없음)
4. 5회 안에 해결 못 하면 멈추고 남은 오류 목록을 사용자에게 보고

---

## 절대 금지 사항 (위반 시 즉시 수정)

```
❌ any 타입 사용 금지
❌ z.enum() 사용 금지 → z.string().refine() 으로 대체
❌ console.log 남기기 금지 (console.error는 허용)
❌ 하드코딩된 businessId 또는 userId 사용 금지
❌ createClient()로 DB 쓰기 작업 금지
❌ 클라이언트 컴포넌트에서 createServiceClient() 사용 금지
```

---

## Supabase 클라이언트 사용 규칙 (핵심)

```typescript
// ✅ 인증 확인 전용 — 쿠키 기반 SSR
import { createClient } from '@/lib/supabase/server'
const authClient = await createClient()
const { data: { user } } = await authClient.auth.getUser()

// ✅ 모든 DB 읽기/쓰기 — RLS 우회, 서버 전용
import { createServiceClient } from '@/lib/supabase/server'
const db = createServiceClient()
const { data } = await db.from('bookings').select('*')
```

**왜 이렇게 쓰는가:** createClient는 RLS가 적용되어 복잡한 조인에서 권한 오류 발생. createServiceClient는 service_role 키로 RLS를 우회하여 안정적.

---

## 페이지 이동 규칙

```typescript
// ✅ 반드시 이것만 사용
window.location.replace('/dashboard')

// ❌ 절대 사용 금지
router.push('/dashboard')   // 서버 컴포넌트 캐시 미갱신
redirect('/dashboard')      // Server Action 내부에서만 허용
```

---

## Supabase 조인 문법 (FK 명시 필수)

```typescript
// ✅ FK 컬럼명 명시 — 다중 관계 충돌 방지
.select('id, profiles!business_id(full_name)')
.select('id, businesses!owner_id(name, phone)')

// ❌ FK 생략 시 다중 관계 에러 발생
.select('id, profiles(full_name)')
```

---

## next-safe-action + Zod v4 패턴

```typescript
// ✅ 올바른 방식
const schema = z.object({
  status: z.string().refine(
    (v) => ['pending', 'confirmed', 'done'].includes(v),
    { message: '유효하지 않은 상태값입니다' }
  ),
})

// ❌ Zod v4에서 next-safe-action과 충돌
const schema = z.object({
  status: z.enum(['pending', 'confirmed', 'done']),
})
```

---

## 에러 처리 패턴

```typescript
// ✅ [APP] prefix — 클라이언트에 전달할 에러만
throw new Error('[APP] 예약 정보를 찾을 수 없습니다')

// 내부 에러는 console.error만
console.error('[Bookings] DB 오류:', error)
return { error: '[APP] 처리 중 오류가 발생했습니다' }
```

---

## 기술 스택

| 항목 | 버전/라이브러리 |
|------|--------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript strict |
| DB | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| UI | shadcn/ui + Tailwind CSS v4 |
| 폼 | React Hook Form + Zod v4 |
| Server Actions | next-safe-action v8 |
| 결제 | TossPayments SDK v2 |
| 알림톡 | Solapi (카카오 알림톡) |
| AI | Anthropic Claude API |
| 상태관리 | Zustand |
| 데이터 페칭 | TanStack React Query v5 |

---

## DB 테이블 구조 (핵심만)

```
profiles          — 사용자 프로필 (id, business_id, role, full_name)
businesses        — 업체 정보 (id, owner_id, name, phone, kakao_channel_id)
subscriptions     — 구독 플랜 (business_id, plan, status, billing_key)
service_items     — 서비스 항목 (business_id, name, base_price, show_in_quote)
quote_tiers       — 가격 번들 (business_id, tier[good/better/best])
quotes            — 견적 (business_id, space_size, good_price, better_price, best_price)
bookings          — 예약 (business_id, quote_id, customer_name, customer_phone, status)
customers         — 고객 DB (business_id, name, phone, address)
contracts         — 정기계약 (business_id, customer_id, frequency, monthly_price)
leads             — 잠재고객 CRM (business_id, name, status)
reports           — 작업 보고 (booking_id, kakao_sent_at)
```

---

## 파일 구조 컨벤션

```
app/
  (auth)/          — 로그인/회원가입 (공개)
  (dashboard)/     — 대시보드 (로그인 필요)
  q/[businessId]/  — 고객용 공개 견적 폼
  api/             — API Routes (결제 등)

lib/
  actions/         — Server Actions (next-safe-action)
  supabase/        — DB 클라이언트 (server.ts, client.ts)
  ai/              — Claude AI 연동
  kakao/           — 알림톡 발송
  config/          — 플랜 설정 (plans.ts)
  types/           — TypeScript 타입

components/
  dashboard/       — 대시보드 전용 컴포넌트
  ui/              — shadcn/ui 기본 컴포넌트
```

---

## Server Action 작성 패턴

```typescript
'use server'
import { authActionClient } from '@/lib/actions/_base'  // 인증된 액션
import { z } from 'zod'

const schema = z.object({ name: z.string().min(1) })

export const createBookingAction = authActionClient
  .schema(schema)
  .action(async ({ parsedInput, ctx: { businessId } }) => {
    const db = createServiceClient()
    // ... DB 작업
    return { success: true }
  })
```

---

## 알림톡 발송 패턴

```typescript
// 퀄리오 단일 채널 대행 발송 구조
// 고객사는 Solapi/카카오 채널 가입 불필요
// #{업체명} 변수로 고객사 구분

import { sendAlimtalk } from '@/lib/kakao/alimtalk'
await sendAlimtalk({
  to: customerPhone,
  templateId: process.env.SOLAPI_TEMPLATE_ID_BOOKING_CONFIRM!,
  variables: { '#{업체명}': businessName, '#{고객명}': customerName }
})
```

---

## 개발 원칙

- 수정 전 반드시 파일을 읽고 이해한 후 변경
- 오류 수정 시 근본 원인을 파악하고 수정 (증상만 덮지 않기)
- 컴포넌트는 'use client' / 서버 컴포넌트 명확히 구분
- 새 마이그레이션 파일명: `YYYYMMDDHHMMSS_설명.sql`
- 반응형 필수: mobile-first (sm → md → lg)
