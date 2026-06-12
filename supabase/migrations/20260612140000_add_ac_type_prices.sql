-- 에어컨 유형별 단가 저장 컬럼 추가
-- key: AC_TYPES[n].id (wall_standard, wall_baramless, stand_standard, stand_smart, system_1way, system_4way, commercial)
-- value: 대당 단가 (원)
-- null이면 base_price로 fallback
alter table service_items
  add column if not exists ac_type_prices jsonb default null;

comment on column service_items.ac_type_prices is
  '에어컨 유형별 대당 단가 (JSON). 예: {"wall_standard":75000,"stand_standard":100000}. null이면 base_price로 fallback';
