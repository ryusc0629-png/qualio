-- 결제 퍼널 이벤트 — 할부 노출→선택→결제 전환율 추적
--
-- 왜 필요한가(M&A/밸류에이션):
--   임베디드 결제(GMV take-rate)의 가치는 "결제가 매출을 올려준다"를 데이터로
--   증명할 때 멀티플이 붙는다(ServiceTitan 모델). 그 근거가 할부 전환율이다.
--   즉 "할부를 노출한 견적 vs 안 한 견적"의 성약/결제 차이를 기록한다.
--
-- 현재 상태: 고객용 예약 결제 플로우는 토스 심사 통과 후 라이브 예정이라
--   이 테이블은 그 시점에 lib/payments/track.ts 로 채워진다. 지금은 레일만 깐다.
--
-- 접근: 본사 관리자 전용 집계 + 서버에서의 기록만. RLS 잠금(service_role 전용).

create table if not exists payment_funnel_events (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid references businesses(id) on delete set null,
  booking_id         uuid,                              -- 예약 결제일 때(FK는 느슨하게)
  event_type         text not null,                     -- 'checkout_shown' | 'installment_shown' | 'installment_selected' | 'paid'
  amount             bigint,                            -- 결제/예상 금액(원)
  installment_months integer,                           -- 할부 개월(일시불=0/null)
  meta               jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists idx_payment_funnel_events_type on payment_funnel_events(event_type);
create index if not exists idx_payment_funnel_events_created on payment_funnel_events(created_at);
create index if not exists idx_payment_funnel_events_business on payment_funnel_events(business_id);

alter table payment_funnel_events enable row level security;
