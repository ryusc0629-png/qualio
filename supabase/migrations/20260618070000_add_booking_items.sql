-- 예약 항목(line items) + 가격 변경 이력
-- 통화 상담 중 항목별 할인, 현장에서 항목 가감 등을 위해 예약을 항목 단위로 분해.
-- 항목이 1개 이상 있으면 bookings.final_price = 항목 합계로 동기화.

-- 1) 예약 항목
create table if not exists booking_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  booking_id  uuid not null references bookings(id) on delete cascade,
  name        text not null,
  quantity    integer not null default 1,
  unit_price  integer not null default 0,
  amount      integer not null default 0,        -- quantity * unit_price (서버에서 계산해 저장)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_booking_items_booking on booking_items(booking_id);
create index if not exists idx_booking_items_business on booking_items(business_id);

-- 2) 가격 변경 이력 (누가·무엇을·왜 바꿨는지 기록 — 2단계 현장 편집/알림이 재사용)
create table if not exists booking_price_changes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  booking_id   uuid not null references bookings(id) on delete cascade,
  changed_by   text not null default 'owner',     -- 'owner' | 'worker' | 'system'
  changed_by_name text,                            -- 변경자 표시용 (직원 이름 등)
  change_type  text not null,                      -- 'add' | 'update' | 'remove'
  item_name    text,
  old_amount   integer,
  new_amount   integer,
  reason       text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_booking_price_changes_booking on booking_price_changes(booking_id);
