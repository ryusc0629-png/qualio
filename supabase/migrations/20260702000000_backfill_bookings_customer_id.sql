-- 기존 예약(bookings)을 전화번호로 고객(customers)과 매칭해 customer_id FK를 채운다.
-- 고객 상세의 서비스 이력·방문 집계가 전화번호(문자열)뿐 아니라 customer_id(FK)로도
-- 정확히 잡히도록 데이터를 통일한다. (Jobber/HCP/ServiceTitan식 단일 customer_id 링크)
--
-- 재실행 안전(idempotent): customer_id가 비어 있고 전화번호가 일치하는 행만 갱신한다.
-- 같은 업체에 같은 전화번호 고객이 여럿이면 가장 최근 생성 고객으로 연결한다(모호성 제거).

update public.bookings b
set customer_id = sub.id
from (
  select distinct on (business_id, phone) business_id, phone, id
  from public.customers
  where phone is not null
  order by business_id, phone, created_at desc
) sub
where b.business_id = sub.business_id
  and b.customer_phone = sub.phone
  and b.customer_id is null
  and b.customer_phone is not null;
