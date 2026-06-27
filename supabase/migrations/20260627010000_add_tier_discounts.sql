-- 견적 플랜(quote_tiers)에 업체 전체 공통 할인 설정 추가
-- discount_rate: 할인율(%) 0~100, discount_amount: 할인액(원)
-- 자동 계산된 플랜 가격에서 (가격 × (1 - 할인율/100) - 할인액) 으로 차감
ALTER TABLE public.quote_tiers
  ADD COLUMN IF NOT EXISTS discount_rate   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
