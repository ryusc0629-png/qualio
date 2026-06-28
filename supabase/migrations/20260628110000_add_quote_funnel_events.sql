-- 견적 퍼널 이벤트 — 고객이 견적 신청 과정에서 어디서 멈추는지 추적
--
-- 왜 필요한가:
--   page_views(방문)와 quotes/bookings(전환 결과)는 이미 잡히지만,
--   그 사이 "견적 폼을 시작했는지", "채팅 어느 질문에서 떠났는지"는 빈칸이었다.
--   이 테이블이 그 중간 단계를 익명 세션 단위로 기록해 이탈 지점을 드러낸다.
--
-- session_id: 고객 브라우저 localStorage의 익명 ID — 한 방문자의 여정을 묶는 키.
--   개인정보 아님(랜덤 UUID). 견적 제출 전이라 이름/전화번호도 없음.
--
-- event_type:
--   'form_started'    — 첫 질문(서비스 선택)을 완료해 폼을 시작함
--   'step_completed'  — 채팅 단계 하나 완료 (step 컬럼에 단계명)
--   'quote_submitted' — 견적서 받기 버튼까지 눌러 제출 완료
--
-- 접근: 공개 페이지에서 기록(인증 없음)되므로 service_role 전용. RLS 잠금.

create table if not exists quote_funnel_events (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  session_id  text        not null,                   -- 익명 방문자 식별(localStorage UUID)
  event_type  text        not null,                   -- 'form_started' | 'step_completed' | 'quote_submitted'
  step        text,                                   -- step_completed일 때 단계명(service/space/...)
  created_at  timestamptz not null default now()
);

create index if not exists idx_quote_funnel_events_business on quote_funnel_events(business_id);
create index if not exists idx_quote_funnel_events_created  on quote_funnel_events(created_at);
create index if not exists idx_quote_funnel_events_type     on quote_funnel_events(event_type);

alter table quote_funnel_events enable row level security;
