# 퀄리오 테스트 가이드

자동화 테스트 프레임워크(Jest/Vitest/Playwright)는 아직 없습니다.
검증은 **① 정적 검사(타입·린트·빌드) + ② 로컬 수동 시나리오 테스트** 두 단계로 합니다.

---

## 0. 사전 준비

```bash
npm install                 # 의존성 설치
# .env.local 필요 (Supabase, Solapi, AI 키 등) — 없으면 로그인/DB 동작 안 함
```

### ⚠️ DB 마이그레이션 먼저 적용 (중요)
Supabase CLI를 쓰지 않으므로 새 마이그레이션은 **Supabase 대시보드 → SQL Editor에 수동 실행**해야 합니다.
예약 항목별 견적 기능은 아래 테이블이 있어야 동작합니다(없으면 항목 추가가 실패함):

- `supabase/migrations/20260618070000_add_booking_items.sql` (booking_items, booking_price_changes)
- `supabase/migrations/20260618085000_add_booking_item_unit.sql` (booking_items.unit)

적용 여부 확인: SQL Editor에서
```sql
select to_regclass('public.booking_items'), to_regclass('public.booking_price_changes');
-- 둘 다 NULL이 아니면 적용됨
```

---

## 1. 정적 검사 (코드 수정 후 항상)

```bash
npx tsc --noEmit     # 타입 오류 — CLAUDE.md 규칙: 통과할 때까지 최대 5회 수정
npm run lint         # ESLint
npm run build        # 프로덕션 빌드까지 깨지지 않는지 (배포 전 필수)
```

- `tsc`는 런타임 없이 가장 빠른 1차 방어선. **커밋 전 최소 이것만은 통과**.
- `build`는 서버/클라이언트 컴포넌트 경계, 동적 라우트 오류 등 `tsc`가 못 잡는 것을 잡음.

---

## 2. 로컬 실행

```bash
npm run dev          # http://localhost:3000
```

테스트 계정으로 로그인 → 대시보드 진입. (배포 환경은 Vercel, 서버 타임존 UTC인 점 유의 → 시간 표시는 KST 변환 확인)

---

## 3. 핵심 시나리오 수동 테스트

### A. 예약 항목별 견적 — 1단계 (사장님 / 대시보드)
1. `/dashboard/schedule`에서 예약 하나 열기 → 예약 상세에 **"항목별 견적"** 영역 확인
2. 항목 추가(서비스 선택 시 단가 자동 채움) → 합계가 늘어나는지
3. 단가/수량/합산 금액 직접 수정 → "이 항목 저장" → toast 확인
4. 항목 삭제(confirm) → 합계 감소
5. 항목이 1개 이상이면 예약의 **결제 금액(final_price)** 이 합계로 동기화되는지
6. **변경 이력** 펼치기 → 추가/수정/삭제 기록 + "사장님"으로 표시

### B. 예약 항목별 견적 — 2단계 (현장 직원 / 모바일)
> 모바일 화면 또는 브라우저 모바일 뷰로 테스트 권장

1. `/field/[workerId]/[bookingId]` 접근 (배정된 직원의 workerId 필요)
2. 상태가 **예정/작업 중**일 때 **"항목별 금액 조정"** 카드가 보이는지
3. 항목 추가/수정/삭제 → 합계 변경 → toast 확인
4. 조정 직후 **하단 결제 버튼 금액**과 상단 고객정보 카드 금액이 **즉시 바뀌는지** (liveTotal)
5. 변경 이력에 **직원 이름**으로 기록되는지 (`changed_by='worker'`)

### C. 사장님 알림 (A·B 연결 확인)
1. B에서 직원이 금액을 조정한 **당일(KST)** 에
2. `/dashboard` 홈 상단 알림에 **"현장에서 금액을 조정한 예약이 N건 있어요"** (보라색 배너) 노출
3. 배너 클릭 → `/dashboard/schedule` 이동 → 해당 예약 열어 이력에서 누가·무엇을 바꿨는지 확인

### D. 모달 스크롤 잠금 (오늘 작업)
1. 고객/계약/리드 추가 모달, 마케팅 글 모달, 이미지 라이트박스 등 열기
2. 모달 내부를 끝까지 스크롤해도 **뒷 배경 페이지가 밀리지 않는지** (스크롤 체이닝 차단)
3. 모달 닫으면 배경 스크롤이 정상 복구되는지
4. (맥북) 모달 열자마자 **첫 클릭이 먹히는지** (포커스 자동 처리)

### E. 포트폴리오 Before/After (오늘 작업)
1. 포트폴리오 글(post_type=portfolio)에 시공 전/후 사진이 있을 때
2. 공개 글 페이지 `/biz/[slug]/posts/[postSlug]`에서 **드래그 슬라이더**로 전후 비교되는지

---

## 4. 회귀 체크 포인트 (자주 깨지는 곳)

- **시간 표시**: `toLocaleString`에 `timeZone: 'Asia/Seoul'` 빠지면 배포 후 9시간 밀림 → KST로 보이는지
- **Supabase 권한**: DB 읽기/쓰기는 `createServiceClient`만 사용 (createClient는 인증 확인용)
- **모바일 우선**: 새 화면은 좁은 폭(max-w-xl)·카드 목록으로 보이는지, 버튼 h-12 이상
- **빈 상태**: 목록이 비었을 때 안내 문구 + 다음 행동 버튼이 있는지

---

## 5. 커밋 전 최종 체크리스트

- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run build` 통과 (큰 변경 시)
- [ ] 위 시나리오 중 **건드린 기능** 수동 확인
- [ ] 병렬 세션 주의: `git add -A` 금지, **내가 수정한 파일만** 스테이징
