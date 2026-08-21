-- 홍보 영상 건별 이용 기록.
--
-- 계정당 무료 5건을 주고, 그 뒤부터 건당 과금한다. 청구는 따로 결제창을 띄우지 않고
-- 다음 달 정기결제 금액에 얹는다(사장님이 결제를 또 하게 만들지 않는다).
--
-- ★완성된 영상에만 행을 만든다 — 실패한 건에 돈을 물리면 안 된다.
-- ★무료분도 amount 0으로 행을 남긴다. 그래야 '무료 5건 중 몇 건 썼는지'를
--   따로 세지 않고 이 표 하나로 알 수 있다.
create table if not exists public.reel_charges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- 보고서 하나당 한 번만 과금한다. 다시 만들어도 두 번 물리지 않는다.
  report_id uuid not null references public.reports(id) on delete cascade,
  -- 공급가액(부가세 별도). 무료분은 0.
  amount integer not null default 0,
  created_at timestamptz not null default now(),
  -- 정기결제에 얹어 청구한 시각. null이면 아직 안 받은 돈.
  billed_at timestamptz default null,
  -- 어느 주문에 얹혔는지 (감사용)
  billed_order_id text default null,
  unique (report_id)
);

alter table public.reel_charges enable row level security;

-- 아직 안 받은 돈을 업체별로 빠르게 모으기 위한 인덱스
create index if not exists reel_charges_unbilled_idx
  on public.reel_charges (business_id)
  where billed_at is null;
