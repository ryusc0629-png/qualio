-- 업체가 켠 모듈 — 모듈 요금제의 구독 상태.
--
-- ★직원 수와 정기 매출은 여기에 저장하지 않는다. 각각 workers·contracts에서 그때그때 센다.
--   저장해두면 직원이 늘어도 요금이 안 오르고, 두 숫자가 어긋나기 시작한다.
--   여기 담는 건 '켰나 껐나'와 마케팅 지역 수뿐이다.
--
-- ⛔모듈을 끌 때 행을 지우지 말 것 — disabled_at만 찍는다. 데이터를 안 지운다는 약속이
--   화면 잠금과 같은 근거이고, 다시 켰을 때 이력이 남아 있어야 한다.
create table if not exists public.business_modules (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  module_id    text not null check (module_id in ('field', 'marketing', 'client')),
  -- 마케팅 전용 — 홍보하는 지역 수(1개 포함). 다른 모듈은 항상 1
  regions      int  not null default 1 check (regions >= 1),
  enabled_at   timestamptz not null default now(),
  disabled_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (business_id, module_id)
);

alter table public.business_modules enable row level security;

create index if not exists business_modules_business_idx
  on public.business_modules (business_id)
  where disabled_at is null;
