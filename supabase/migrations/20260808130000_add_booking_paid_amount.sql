-- 예약별 수금액 추적 — '못 받은 돈(미수금)' 계산용
-- 미수금 = final_price(총액) - paid_amount(실제 받은 금액)
-- 청소맨 대비 daily-ops 방어: 사장님이 "이 고객한테 아직 못 받은 돈"을 매일 확인.

alter table bookings
  add column if not exists paid_amount integer not null default 0;

-- 기존 완료 건은 '수금 완료'로 간주해 backfill.
-- (과거 데이터에 허위 미수금이 뜨지 않도록. 예전 '수금 완료'는 곧 입금 받았다는 의미)
update bookings
  set paid_amount = round(coalesce(final_price, 0))::integer
  where status = 'completed';
