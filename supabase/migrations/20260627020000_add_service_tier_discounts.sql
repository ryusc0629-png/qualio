-- 서비스 항목(service_items)별 플랜 할인 — 서비스마다 기본/추천/프리미엄 할인을 따로 설정
-- 자동 계산된 플랜 가격(기본가×배수)에서 (가격 × (1 - 율/100) - 액) 으로 차감
ALTER TABLE public.service_items
  ADD COLUMN IF NOT EXISTS tier_good_discount_rate     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_good_discount_amount   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_better_discount_rate   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_better_discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_best_discount_rate     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_best_discount_amount   numeric NOT NULL DEFAULT 0;
