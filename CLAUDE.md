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

## 타겟 사용자 — 비테크 청소업체 사장님

**페르소나**: 40~60대, PC 익숙하지 않음, 스마트폰은 카카오톡 수준, 처음 보는 화면을 혼자 해결해야 함.
**목표**: CS 문의 없이 온보딩 완료. 모든 UI는 이 기준으로 판단한다.

### UX 규칙 (위반 시 즉시 수정)

#### 언어
```
❌ "GEO 최적화", "마이그레이션", "slug", "JSON-LD"  → 사용자에게 노출 금지
✅ "AI 홍보 페이지", "내 업체 주소", "자동 설정"     → 행동/결과 중심 표현

❌ "저장에 실패했습니다"        → 원인도 행동도 없는 메시지
✅ "저장 못 했어요. 다시 눌러주세요"  → 다음 행동을 알려줌
```

#### 버튼 & 액션
```
❌ "확인", "제출", "완료"      → 무슨 일이 일어나는지 모름
✅ "견적 보내기", "예약 확정", "저장하기"  → 동사형, 결과 명확

- 버튼 최소 높이: h-12 (모바일 터치 영역 44px 이상)
- 주요 CTA는 화면당 1개, 가장 눈에 띄는 위치
- 파괴적 액션(삭제 등)은 반드시 confirm 다이얼로그
```

#### 빈 상태 (Empty State)
```
❌ 빈 화면, 빈 테이블만 표시
✅ 빈 상태마다 반드시: 아이콘 + "아직 ~가 없어요" + 다음 행동 버튼

예시:
<div className="text-center py-12 space-y-3">
  <p className="text-muted-foreground">아직 등록된 고객이 없어요</p>
  <Button>첫 번째 고객 추가하기</Button>
</div>
```

#### 로딩 & 피드백
```
- 모든 비동기 액션: 버튼에 isPending → disabled + 로딩 텍스트 ("저장 중...")
- 성공: toast.success("저장됐어요!") — 항상 한국어, 과거형 동사
- 실패: toast.error("다시 시도해주세요") — 기술 용어 금지
- 2초 이상 걸리는 작업: 진행 상태 텍스트 변경 ("AI가 작성 중이에요...")
```

#### 입력 폼
```
- placeholder는 반드시 실제 예시값 (예: "010-1234-5678", "서울시 강남구 역삼동")
- 필수 입력란 표시: * 대신 "(필수)" 텍스트
- 에러 메시지: 인풋 바로 아래, 빨간 텍스트, 해결 방법 포함
  예: "전화번호는 숫자만 입력해주세요 (예: 01012345678)"
- 모바일 키보드 타입: 전화번호 inputMode="tel", 숫자 inputMode="numeric"
```

#### 온보딩 플로우
```
- 화면당 입력 필드 최대 5개 (넘으면 단계 분리)
- 진행 단계 표시 필수: "2/4단계"
- 각 단계 상단에 한 줄 설명: "어떤 서비스를 제공하시나요?"
- 선택지가 있으면 텍스트 대신 카드형 버튼 우선
- 뒤로 가기 항상 제공 (이전 단계 데이터 보존)
```

#### 모바일 우선
```
- max-w-xl 이하 컨테이너 기본 (대시보드 콘텐츠)
- 테이블 대신 카드 목록 (모바일에서 테이블 스크롤 금지)
- 스와이프/탭 인터랙션 고려 (hover 의존 UI 금지)
```

---

## 개발 원칙

- 수정 전 반드시 파일을 읽고 이해한 후 변경
- 오류 수정 시 근본 원인을 파악하고 수정 (증상만 덮지 않기)
- 컴포넌트는 'use client' / 서버 컴포넌트 명확히 구분
- 새 마이그레이션 파일명: `YYYYMMDDHHMMSS_설명.sql`
- 반응형 필수: mobile-first (sm → md → lg)
