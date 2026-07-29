-- B2B 견적서 할인 설정
-- discount_type: 'rate'(할인율 %) | 'amount'(정액 원) | NULL(할인 없음)
-- discount_value: rate면 퍼센트(예: 10), amount면 원 단위 금액(예: 50000)
-- 할인은 소계에서 차감한 뒤 부가세를 계산한다(소계 → 할인 → 부가세 → 합계).
ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS discount_type  TEXT,
  ADD COLUMN IF NOT EXISTS discount_value INTEGER NOT NULL DEFAULT 0;
