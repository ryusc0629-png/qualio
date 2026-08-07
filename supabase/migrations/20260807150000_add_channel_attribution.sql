-- 채널 유입 추적을 '방문'에서 '오더(문의·예약·매출)'까지 확장.
-- 기존엔 page_views.channel로 방문만 채널이 붙어, 어느 채널이 실제 매출을 만들었는지 알 수 없었다.
-- 견적(quotes)·리드(leads)·예약(bookings)에 유입 채널(?ch= 값)을 저장해
-- 대시보드에서 '채널 → 문의 → 예약 → 매출'을 집계할 수 있게 한다.
-- 값은 marketing-channels.ts의 정규화된 채널 키(youtube, flyer, proposal 등)만 저장한다.

alter table public.quotes   add column if not exists channel text;
alter table public.leads    add column if not exists channel text;
alter table public.bookings add column if not exists channel text;

-- 채널별 집계용 인덱스 (업체 + 채널)
create index if not exists idx_quotes_business_channel   on public.quotes   (business_id, channel);
create index if not exists idx_leads_business_channel    on public.leads    (business_id, channel);
create index if not exists idx_bookings_business_channel on public.bookings (business_id, channel);
