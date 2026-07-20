-- KCP 결제 주문 매핑 테이블
-- KCP ordr_idxx는 길이 제한이 있어 businessId(UUID)를 직접 못 넣음 →
-- 짧은 주문번호로 거래등록 시 pending 저장, 리턴(승인) 시 조회해 위변조 방지 + 구독 활성화
create table if not exists public.kcp_payment_orders (
  ordr_idxx   text primary key,                 -- KCP 주문번호(짧은 코드)
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id     text not null,                     -- starter | pro | scale
  amount      integer not null,                  -- 기대 결제 금액(원, 위변조 검증 기준)
  status      text not null default 'pending',   -- pending | paid | failed
  kcp_tno     text,                              -- KCP 거래번호(승인 후)
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index if not exists idx_kcp_orders_business on public.kcp_payment_orders(business_id);

-- RLS 활성화 + 정책 없음 → service_role(서버)만 접근 (클라이언트 직접 접근 차단)
alter table public.kcp_payment_orders enable row level security;
