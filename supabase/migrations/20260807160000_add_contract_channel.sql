-- 정기계약(contracts)에도 유입 채널을 저장 — 채널 오더귀속을 계약 매출까지 확장.
-- 정기 방문 예약(bookings)은 월정액이라 0원으로 저장돼 방문 단건으로는 매출을 채널에 귀속할 수 없다.
-- 그래서 계약 자체(월정액 × 기간)를 계약의 channel로 집계한다.
-- 값은 marketing-channels.ts의 정규화된 채널 키만 저장(수기 등록 시 '어떻게 알고 오셨어요?' 또는 리드에서 승계).

alter table public.contracts add column if not exists channel text;

create index if not exists idx_contracts_business_channel on public.contracts (business_id, channel);
