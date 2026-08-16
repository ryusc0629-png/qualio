-- 고객이 가진 '다음 이용 할인'을 담는다.
--
-- 왜 이 형태인가: 후기 보상을 기프티콘으로 주면 매번 사람이 사서 보내야 해서
-- 두 달이면 반드시 멈춘다. '다음 이용 할인'은 운영비가 0이고 자동으로 적립되며
-- 재방문까지 만든다. 또 "리뷰를 쓴 대가"가 아니라 재방문 유도라서
-- 네이버 플레이스의 대가성 리뷰 금지에도 걸리지 않는다.
--
-- 고객을 전화번호로도 잡는 이유: 후기를 남긴 시점에 customers 행이 아직
-- 없을 수 있다(일회성 고객). 나중에 고객이 생기면 전화번호로 이어붙인다.
create table if not exists public.customer_rewards (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  customer_id   uuid references public.customers(id) on delete set null,
  customer_phone text not null,

  -- 'discount_rate'(%) | 'discount_amount'(원)
  reward_type   text not null,
  reward_value  integer not null check (reward_value > 0),

  -- 어디서 생겼는지 (지금은 'review' 하나)
  source        text not null default 'review',
  source_id     uuid,                    -- review_claims.id

  issued_at     timestamptz not null default now(),
  expires_at    timestamptz,             -- null이면 무기한
  used_at       timestamptz,             -- 사장님이 '사용함' 처리한 시각
  used_booking_id uuid references public.bookings(id) on delete set null,

  created_at    timestamptz not null default now()
);

alter table public.customer_rewards enable row level security;

-- 같은 후기로 두 번 적립되지 않게
create unique index if not exists customer_rewards_source_uniq
  on public.customer_rewards (source, source_id)
  where source_id is not null;

-- 고객 화면에서 '쓸 수 있는 할인' 조회
create index if not exists customer_rewards_lookup_idx
  on public.customer_rewards (business_id, customer_phone, used_at);

comment on table public.customer_rewards is
  '후기를 남긴 고객에게 자동 적립되는 다음 이용 할인. 기프티콘 수동 발송을 대체한다.';
