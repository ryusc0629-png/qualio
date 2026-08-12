-- 정기계약 금액 변경 이력
--
-- 계약 도중 작업 범위가 늘어 월 금액이 바뀌는 일이 흔한데(공용부만 → 공용부+진료센터),
-- contract_price 한 칸만 덮어쓰면 과거 매출까지 새 금액으로 소급 계산돼 누적 매출이 틀어진다.
-- 그래서 "언제부터 얼마" 구간을 남기고, 누적 매출은 구간별로 계산한다.
--
-- 형식: [{ "from": "2026-07-31", "price": 1000000, "note": null },
--        { "from": "2026-08-12", "price": 1500000, "note": "진료센터 추가" }]
--   · from 오름차순. 첫 항목은 계약 최초 금액(= start_date부터).
--   · 비어 있으면(null) contract_price가 전 구간에 적용된 것으로 본다 — 기존 계약 호환.
--   · contract_price는 항상 마지막 구간 금액과 동기화한다(현재 월 금액 = MRR 표시용).
alter table public.contracts add column if not exists price_history jsonb;

comment on column public.contracts.price_history is
  '월 계약금액 변경 이력 [{from,price,note}]. 누적 매출을 구간별로 계산해 소급 왜곡을 막는다.';
