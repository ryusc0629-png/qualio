-- service_items에 항목별 단가(unit_prices) 컬럼 추가
-- 형식: [{ "name": "화장실", "price": 50000 }, { "name": "주방", "price": 80000 }]
-- null이면 기존 base_price 고정가 방식 사용

alter table service_items
  add column if not exists unit_prices jsonb;
