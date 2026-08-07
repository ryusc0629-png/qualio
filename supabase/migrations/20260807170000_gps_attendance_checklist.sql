-- 현장 근태 강화: GPS 위치 기록 + 작업 매뉴얼 체크리스트 (샤플 대체)
-- 방향: GPS는 "기록·표시만"(현장 근처인지 대표가 확인, 막지는 않음).
--       체크리스트는 대표가 현장별 작업 항목을 정하고, 직원이 항목마다 사진을 올려야 작업 완료.

-- ── GPS 출퇴근: 도착/마감 사진을 올릴 때의 직원 위치 ──
alter table public.bookings add column if not exists checkin_lat  double precision;
alter table public.bookings add column if not exists checkin_lng  double precision;
alter table public.bookings add column if not exists checkin_acc  double precision;  -- 위치 정확도(m)
alter table public.bookings add column if not exists checkout_lat double precision;
alter table public.bookings add column if not exists checkout_lng double precision;
alter table public.bookings add column if not exists checkout_acc double precision;

-- 현장 좌표 캐시 (service_address를 1회 지오코딩해 저장 → 도착 위치와 거리 계산에 재사용)
alter table public.bookings add column if not exists site_lat double precision;
alter table public.bookings add column if not exists site_lng double precision;

-- ── 작업 매뉴얼 체크리스트 ──
-- 계약(현장)별 작업 항목 목록: [{ "id": "...", "label": "화장실 바닥" }, ...]
alter table public.contracts add column if not exists checklist_items jsonb;
-- 방문별 항목 사진 진행: { "<itemId>": ["url1", "url2"] }
alter table public.bookings add column if not exists checklist_photos jsonb;

comment on column public.bookings.checkin_lat is '도착(오픈) 사진 올릴 때 직원 위도';
comment on column public.bookings.site_lat is 'service_address 지오코딩 위도(캐시) — 도착 위치와 거리 계산용';
comment on column public.contracts.checklist_items is '현장 작업 항목 [{id,label}] — 직원이 항목마다 사진 올려야 완료';
comment on column public.bookings.checklist_photos is '방문별 작업 항목 사진 { itemId: [url] }';
