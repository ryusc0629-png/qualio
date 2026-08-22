-- 급여 추가 지급·공제 줄.
--
-- 왜 필요한가: 급여를 '사람마다 방식 하나(시급/일급/건당)'로만 계산하면 현실과 안 맞는다.
-- 정기 담당 직원은 월급 고정인데 추가 업무를 하면 더 주고, 일회성 현장은 어떤 곳은 도급 수수료를
-- 뗀 금액을, 어떤 곳은 그냥 일당을 준다. 그래서 기본급(자동 계산) 위에 이 줄들을 얹는다.
--
-- booking_id가 있으면 '그 현장에 준 돈', 없으면 그 달 전체에 대한 조정이다.
-- amount가 음수면 공제(선지급 회수 등).

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  -- 'YYYY-MM' (KST 기준 달). 급여는 달 단위로만 다루므로 date가 아니라 문자열로 둔다.
  month text not null,
  -- 현장에 붙는 지급이면 그 예약. 예약이 지워져도 급여 기록은 남아야 하므로 set null.
  booking_id uuid references public.bookings(id) on delete set null,
  label text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

alter table public.payroll_entries enable row level security;

create index if not exists payroll_entries_worker_month_idx
  on public.payroll_entries (business_id, worker_id, month);
