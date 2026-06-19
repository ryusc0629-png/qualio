# 퀄리오(Qualio) 개발자 온보딩 가이드

> **이 문서 하나만 끝까지 읽으면 전체 프로젝트를 파악할 수 있도록 만들었습니다.**
> 새로 합류하는 책임 개발자를 위한 인수인계 문서입니다. 막히면 먼저 여기를 보세요.
> (코딩 규칙의 "강제 사항"은 별도 파일 **`CLAUDE.md`** 에 있습니다. 반드시 함께 읽으세요.)

---

## 0. 5분 요약 (TL;DR)

- **무엇:** 한국형 청소/홈케어 업체용 B2B SaaS. 해외(미국)의 Jobber·Housecall Pro·ServiceTitan의 한국판.
- **누가 씀:** 40~60대 비테크 청소업체 사장님. **모든 UI는 "CS 문의 없이 혼자 온보딩"을 기준으로 판단**한다.
- **핵심 가치 흐름:** 견적 → 예약 → 결제 → 알림톡(카카오) → 작업 보고 → 리뷰 → 포트폴리오 자동 생성까지 **운영 자동화**.
- **스택:** Next.js 16 (App Router) · TypeScript strict · Supabase(Postgres+RLS) · Tailwind v4 · shadcn/ui.
- **배포:** Vercel. 서버는 **UTC**로 동작(시간 표시 주의 — 4-2 참고).
- **DB 접근:** 거의 모든 읽기/쓰기는 `createServiceClient()`(service_role, RLS 우회). 인증 확인만 `createClient()`.

> 지금은 **무료 베타** 단계다. 단기 목표는 유료 전환과 리텐션 증명. 중장기 로드맵(결제망·소모품 유통·일본 진출)은 9장 참고.

---

## 1. 로컬 개발 환경 세팅

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 — .env.local 생성 (키 목록은 아래 표 참고, 값은 사장님/팀에서 전달받기)

# 3) 개발 서버
npm run dev          # http://localhost:3000

# 4) 타입 체크 (커밋 전 필수)
npx tsc --noEmit

# 5) 린트
npm run lint
```

### 환경변수 (`.env.local`)

| 키 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 클라이언트(인증용) |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용** DB 읽기/쓰기 (절대 클라이언트 노출 금지) |
| `NEXT_PUBLIC_APP_URL` | 앱 기본 URL (링크 생성용) |
| `ANTHROPIC_API_KEY` | Claude AI (견적 피치·보고서·포트폴리오 생성 등) |
| `OPENAI_API_KEY` | 회의록 음성 인식(transcribe) |
| `FAL_KEY` | 마케팅 이미지 생성 (**운영 환경에만** 설정) |
| `CREATOMATE_API_KEY` | 릴스 자동 편집 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_KAKAO_PF_ID` / `SOLAPI_SENDER_PHONE` / `SOLAPI_TEMPLATE_ID_*` | 카카오 알림톡 발송 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 웹 푸시 알림 |
| `CRON_SECRET` | 크론 엔드포인트 인증 |
| `ADMIN_EMAILS` | 관리자 이메일(쉼표 구분) |
| `NEXT_PUBLIC_MARKET` | **(신규)** 활성 국가. 미설정=한국(`KR`). 일본은 `JP` — 9장 참고 |

---

## 2. 디렉토리 구조

```
app/
  (auth)/            로그인·회원가입 (공개)
  (onboarding)/      가입 후 초기 설정 마법사
  (dashboard)/       사장님 대시보드 (로그인 필요) ← 제품의 본체
  q/[businessId]/    고객용 공개 견적 폼 / 견적 결과 / 영수증 / 작업 보고
  biz/[slug]/        업체별 공개 홍보 페이지 + 포트폴리오(시공 사례)
  field/[workerId]/  현장 직원용 웹앱 (토큰 URL 접근, 로그인 없음)
  review/[token]/    고객 리뷰 작성
  api/
    payment/         토스페이먼츠 결제 확정·취소
    cron/            정기 작업 (3장 참고)
    auth/callback/   Supabase 인증 콜백
    upload-*/        이미지·로고 업로드
    creatomate/      릴스 편집 웹훅

lib/
  actions/           Server Actions (next-safe-action) — 쓰기 작업의 핵심 (22개)
  supabase/          DB 클라이언트 (server.ts, client.ts)
  ai/                Claude/OpenAI 연동 (견적 피치, 보고서, 포트폴리오, 마케팅 등)
  kakao/             알림톡 발송 (alimtalk.ts)
  config/            플랜 정의 (plans.ts)
  format/            ★ 통화·날짜·전화 포맷 (money.ts, datetime.ts, phone.ts)
  i18n/              ★ 마켓(국가) 설정 단일 소스 (locale.ts)
  types/             DB 타입 (database.ts — Supabase 생성물)
  hooks/             공용 훅 (스크롤락 등)
  address/           다음(카카오) 우편번호 검색 공용 유틸

components/
  ui/                shadcn/ui 기본 컴포넌트
  dashboard/         대시보드 전용 컴포넌트
  layout/            셸·사이드바
  field/ quote/      현장앱·견적 전용

supabase/migrations/ DB 마이그레이션 (현재 55개, 파일명 = 타임스탬프_설명.sql)
```

---

## 3. 핵심 도메인 & 데이터 흐름

### 메인 플로우 (이걸 이해하면 80%를 이해한 것)

```
[고객] 공개 견적 폼(q/[businessId])
   → quotes 생성 (good/better/best 3단 가격)
   → [사장님] 대시보드에서 확인 → 예약 확정
   → bookings 생성 → 알림톡 발송(예약 확정)
   → [현장 직원] field 앱에서 작업 → 항목별 견적 조정(booking_items) → 수금
   → 영수증 + 리뷰 요청 자동 발송
   → 작업 보고(reports) 작성 → 고객에게 발송
   → 보고 내용 → 포트폴리오(시공 사례) 자동 생성 → 공개 홍보 페이지(biz/[slug]) 노출
```

### 주요 테이블 (자세한 컬럼은 `lib/types/database.ts`)

| 테이블 | 설명 |
|---|---|
| `profiles` | 사용자 프로필 (business_id, role, full_name) |
| `businesses` | 업체 정보 (owner_id, name, phone, 브랜드 색상, 공개 slug) |
| `subscriptions` | 구독 플랜 (plan, status, billing_key, next_plan) |
| `service_items` | 서비스 항목 (base_price, 단가 등) |
| `quote_tiers` / `quotes` | 가격 번들 / 견적 (good/better/best) |
| `bookings` / `booking_items` | 예약 / 예약 항목별 견적(편집 이력 포함) |
| `customers` / `contracts` | 고객 DB / 정기계약 |
| `leads` | 잠재고객 B2B 영업 파이프라인 (CRM) |
| `reports` | 작업 보고 (알림톡 발송 기록) |
| `biz_posts` | 포트폴리오·마케팅 글 (채널 업로드 상태 포함) |

> **B2B가 핵심이다.** 타겟 고객 상당수가 법인 거래처(거래처당 월 70만원+). 그래서 `leads`(영업 파이프라인)와 `contracts`(정기계약)가 단순 일회성 예약만큼 중요하다.

---

## 4. 반드시 지켜야 하는 규칙 (요약 — 전문은 `CLAUDE.md`)

> ⚠️ 아래는 **요약**이다. 실제 작업 전 `CLAUDE.md`를 정독할 것. 위반 시 빌드 실패하거나 운영 버그가 난다.

### 4-1. Supabase 클라이언트 (가장 중요)

```typescript
// 인증 확인 전용 (쿠키 기반)
import { createClient } from '@/lib/supabase/server'
const authClient = await createClient()
const { data: { user } } = await authClient.auth.getUser()

// 모든 DB 읽기/쓰기 (RLS 우회, 서버 전용)
import { createServiceClient } from '@/lib/supabase/server'
const db = createServiceClient()
```
- `createClient()`로 **쓰기 금지** / 클라이언트 컴포넌트에서 `createServiceClient()` **사용 금지**.
- 조인 시 FK 명시: `.select('id, profiles!business_id(full_name)')`

### 4-2. 시간 표시 (UTC→KST 함정)

Vercel 서버는 **UTC**. 날짜/시간을 화면에 표시할 땐 타임존을 반드시 명시해야 한다.
→ **이제는 `lib/format/datetime.ts`의 `formatDate`/`formatTime`/`formatDateTime`을 쓰면 자동 처리된다** (8장 참고).
직접 `toLocaleString`을 쓸 경우 `timeZone: 'Asia/Seoul'`을 빠뜨리면 배포 후 9시간 밀린다.

### 4-3. 금지 사항

```
❌ any 타입
❌ z.enum()  → z.string().refine() 으로 대체 (Zod v4 + next-safe-action 충돌)
❌ console.log (console.error는 허용)
❌ 하드코딩된 businessId / userId
❌ 페이지 이동에 router.push / redirect → window.location.replace('/...') 만 사용
```

### 4-4. UX 규칙 (타겟 = 비테크 사장님)

- 버튼은 동사형("견적 보내기"), 최소 높이 `h-12`, 화면당 주요 CTA 1개.
- 빈 상태마다 "아직 ~가 없어요" + 다음 행동 버튼.
- 비동기 액션은 `isPending`으로 로딩 표시, 성공/실패 toast는 한국어·비기술 용어.
- 모바일 우선(테이블 대신 카드 목록), 커스텀 모달엔 포커스 + `ScrollLock` 필수.

---

## 5. Server Action 작성 패턴 (쓰기 작업의 표준)

거의 모든 데이터 변경은 `lib/actions/`의 next-safe-action으로 한다.

```typescript
'use server'
import { authActionClient } from '@/lib/actions/_base'  // 인증된 액션
import { z } from 'zod'

const schema = z.object({ name: z.string().min(1) })

export const createBookingAction = authActionClient
  .schema(schema)
  .action(async ({ parsedInput, ctx: { businessId } }) => {
    const db = createServiceClient()
    // ... DB 작업 (businessId는 ctx에서 — 절대 하드코딩/클라이언트 입력 금지)
    return { success: true }
  })
```
- 클라이언트에 보여줄 에러만 `'[APP] ...'` prefix. 내부 에러는 `console.error`.
- 기존 액션들(`bookings.ts`, `quotes.ts`, `crm.ts` 등)을 먼저 읽고 패턴을 따를 것.

---

## 6. 외부 연동

| 연동 | 위치 | 메모 |
|---|---|---|
| **토스페이먼츠 v2** | `app/api/payment/`, `lib/actions/subscription.ts` | 결제 확정/취소. 결제망 구축이 중장기 핵심 (9장) |
| **카카오 알림톡(Solapi)** | `lib/kakao/alimtalk.ts` | **퀄리오 단일 채널 대행 발송** — 고객사는 채널 가입 불필요, `#{업체명}` 변수로 구분 |
| **Claude(Anthropic)** | `lib/ai/*` | 견적 피치, 작업 보고, 포트폴리오/마케팅 글, 회의 요약 |
| **OpenAI** | `lib/ai/transcribe.ts` | 회의 녹음 → 텍스트 |
| **FAL** | `lib/ai/image-gen.ts` | 마케팅 이미지. **운영 환경에만** 키 설정 |
| **Creatomate** | `lib/creatomate/`, `app/api/creatomate/` | 릴스 자동 편집 (웹훅 콜백) |
| **웹 푸시** | `lib/push/web-push.ts` | 사장님 브라우저 알림 |

---

## 7. 크론(정기 작업) 구조 — ⚠️ 함정 주의

- Vercel **Hobby 플랜은 cron 최대 2개**. → `vercel.json`엔 **2개만** 등록돼 있다:
  - `/api/cron/auto-post` (매일 00:00 UTC) — 마케팅/포트폴리오 자동 발행
  - `/api/cron/daily-maintenance` (매일 01:00 UTC) — **나머지 작업들을 묶어서 호출하는 허브**
- `app/api/cron/` 폴더엔 라우트가 7개 있지만(`expire-quotes`, `quote-followup`, `reengagement`, `remind`, `review-request` 등), 이들은 `vercel.json`에 직접 등록하지 않고 **`daily-maintenance`가 내부에서 호출**한다.
- **새 정기 작업을 추가할 땐 새 cron을 만들지 말고 `daily-maintenance`에 통합**할 것.

---

## 8. 국제화(i18n) — 통화·날짜·전화 포맷 규칙 ★

> 일본 등 해외 진출에 대비해 **"한국 전용으로 굳지 않도록"** 추상화해 둔 영역이다.
> 지금 동작은 100% 한국이지만, **새 코드는 반드시 아래 공용 포매터를 쓴다.**

### 단일 소스: `lib/i18n/locale.ts`

현재 국가(통화·타임존·로케일·전화규칙)를 한 곳에서 정의한다. `NEXT_PUBLIC_MARKET` 환경변수로 전환(`KR` 기본 / `JP`). 모든 포매터가 이 설정을 읽는다.

### 공용 포매터 (직접 `toLocaleString` 호출 대신 이걸 사용)

```typescript
// 금액
import { formatMoney, formatAmount } from '@/lib/format/money'
formatMoney(39000)   // "39,000원"  (일본: "¥39,000")
formatAmount(39000)  // "39,000"    (기호 없이 천단위만)

// 날짜/시간 (timeZone 자동 처리 — UTC 밀림 걱정 없음)
import { formatDate, formatTime, formatDateTime } from '@/lib/format/datetime'
formatDate(iso)        // "2026년 6월 19일"
formatTime(iso)        // "오후 2:30"
formatDateTime(iso)    // "2026년 6월 19일 오후 2:30"
// 옵션 override 가능: formatDate(iso, { month: 'short', day: 'numeric' })

// 전화번호 (마켓별 하이픈 규칙)
import { formatPhone } from '@/lib/format/phone'
```

### 점진 이관 정책 (중요)

- 기존 코드 곳곳에 `toLocaleString('ko-KR') + '원'`(100곳+)과 `timeZone: 'Asia/Seoul'`(19곳)이 **인라인으로 남아 있다.** 한 번에 다 바꾸지 않았다(대규모 변경 = 회귀 위험).
- **규칙:** ① 새로 작성하는 코드는 무조건 공용 포매터 사용. ② 기존 파일을 만질 일이 생기면 그 김에 해당 부분만 공용 포매터로 교체(보이스카우트 규칙).
- **콘텐츠 문자열**(약관, 알림톡 템플릿 문구, AI 프롬프트 안의 '원' 등)은 i18n 대상이 아니다 — 해외 진출 시 어차피 통째로 현지화/재작성하는 **콘텐츠 레이어**다. 포맷 추상화 대상은 "숫자/날짜를 화면에 찍는 코드"만이다.

---

## 9. 비즈니스 로드맵 (코드 결정에 영향을 주는 맥락)

개발 우선순위를 이해하려면 사업 방향을 알아야 한다. 순서대로 진행한다:

1. **SaaS 코어 — 리텐션 증명** (현재 단계). 가입 후 매출 상승/핵심 행동을 추적하는 지표가 다음 큰 과제.
2. **임베디드 결제(GMV take-rate)** — 토스 기반. 할부 옵션을 견적/예약에 노출하고 전환율을 추적해, 결제를 "비용"이 아닌 "매출 도구"로 만든다. 자본이 거의 안 들면서 밸류에이션 레버가 가장 크다.
3. **PB 소모품(청소 약품) 유통** — 앱 내 주문 + 소진 예측 + 픽업 거점. SaaS lock-in(이탈 방어)이 핵심 목적.
4. **일본 진출** — SaaS 워크플로는 그대로 이식(8장 i18n이 그 준비). 결제·소모품은 시장별 재구축. CEO 영입 후 한국 베이스가 단단해진 뒤 착수.

> 그래서 8장의 i18n 추상화와 2번의 결제 트래킹이 **지금 깔아두면 싸고, 나중에 retrofit하면 비싼** 작업이다.

---

## 10. 자주 막히는 지점 (체크리스트)

- [ ] DB 쓰기인데 권한 에러? → `createClient()` 말고 `createServiceClient()` 썼는지 확인.
- [ ] 배포 후 시간이 9시간 밀림? → 직접 `toLocaleString`에 `timeZone` 누락. `lib/format/datetime.ts`로 교체.
- [ ] Zod 스키마에서 next-safe-action 에러? → `z.enum()`을 `z.string().refine()`으로.
- [ ] 페이지 이동 후 데이터가 안 갱신됨? → `router.push` 대신 `window.location.replace`.
- [ ] 맥북에서 모달 첫 클릭이 안 먹음 / 배경이 밀림? → 커스텀 모달에 포커스 처리 + `ScrollLock` 누락. `CLAUDE.md` 참고.
- [ ] 새 cron 추가하려는데 Vercel에서 막힘? → 2개 제한. `daily-maintenance`에 통합.
- [ ] 새 컬럼을 추가했는데 타입 에러? → `database.ts` 미갱신. `CLAUDE.md`의 "새 컬럼 타입 단언 패턴" 참고.

---

## 11. 함께 볼 문서

- **`CLAUDE.md`** — 강제 코딩 규칙 전문 (이 문서보다 우선한다)
- **`AGENTS.md`** — Next.js 16은 기존과 다르니 `node_modules/next/dist/docs/`를 먼저 보라는 안내
- **`TESTING.md`** — 테스트 관련
- `lib/types/database.ts` — DB 스키마의 사실상 단일 소스
- `supabase/migrations/` — 스키마 변경 이력 (파일명: `YYYYMMDDHHMMSS_설명.sql`)

---

_막히면: 먼저 이 문서 → `CLAUDE.md` → 해당 도메인의 기존 `lib/actions/*` 파일 순으로 보면 거의 답이 나옵니다._
