-- 고객 추가 요청사항 컬럼 추가 (현장에서 고객이 추가로 요청한 내용)
alter table bookings add column if not exists customer_request text;
