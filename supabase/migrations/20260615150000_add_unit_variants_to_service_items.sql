-- service_items에 항목별 단가 구분(unit_variants) 컬럼 추가
-- 형식: ["신축", "구축"] — 빈 배열이거나 null이면 구분 없이 단일 단가 사용
-- unit_prices 아이템에 variant 필드 추가: [{name, price, variant?}]

alter table service_items
  add column if not exists unit_variants jsonb;
