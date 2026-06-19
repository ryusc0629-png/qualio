-- claims: customer complaints / unresolved issues per business
-- Tracks a complaint from open to resolved. Linked to a booking optionally.
create table if not exists public.claims (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  booking_id     uuid references public.bookings(id) on delete set null,
  customer_name  text not null,
  customer_phone text,
  title          text not null,
  content        text,
  is_urgent      boolean not null default false,
  status         text not null default 'open',
  resolution     text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists claims_business_status_idx
  on public.claims (business_id, status);

-- RLS: server uses service_role which bypasses RLS. Enable + restrict by default.
alter table public.claims enable row level security;
