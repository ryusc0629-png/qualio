-- 정기계약 방문 이중 생성 방지: (contract_id, scheduled_at) 유니크 인덱스.
-- 계약 등록과 매일 크론이 동시에 돌거나 크론이 중복 발화하면, 같은 커서를 읽어
-- 동일한 방문(bookings)이 두 번 insert되던 레이스가 있었다. DB 레벨에서 원천 차단한다.
-- contract_id가 NULL인 일반 예약은 유니크 인덱스에서 NULL이 서로 distinct로 취급되므로 영향 없음.

-- 1) 혹시 이미 쌓인 중복이 있으면 정리 — 각 (contract_id, scheduled_at)에서 먼저 만든 것만 남김
with dupes as (
  select id,
         row_number() over (
           partition by contract_id, scheduled_at
           order by created_at, id
         ) as rn
  from bookings
  where contract_id is not null
)
delete from booking_workers bw
using dupes d
where bw.booking_id = d.id and d.rn > 1;

with dupes as (
  select id,
         row_number() over (
           partition by contract_id, scheduled_at
           order by created_at, id
         ) as rn
  from bookings
  where contract_id is not null
)
delete from bookings b
using dupes d
where b.id = d.id and d.rn > 1;

-- 2) 유니크 인덱스 — 이후 동일 방문 재삽입은 DB가 거부(upsert ignoreDuplicates로 조용히 스킵)
create unique index if not exists bookings_contract_scheduled_uniq
  on bookings (contract_id, scheduled_at);
