-- 서비스별 플랜(기본/추천/프리미엄) 직접 가격 (원/평 또는 정액 기준 단가).
-- null이면 기존처럼 기본가 × 배수(1.0/1.2/1.5) 자동 계산.
-- 값이 있으면 그 가격을 그대로 사용해 사장님이 플랜별 금액을 직접 정할 수 있음.
alter table service_items
  add column if not exists tier_good_price integer,
  add column if not exists tier_better_price integer,
  add column if not exists tier_best_price integer;
