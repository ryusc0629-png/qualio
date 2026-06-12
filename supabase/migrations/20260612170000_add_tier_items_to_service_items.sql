-- 서비스 항목별 플랜 구성 항목 저장
-- 업체가 직접 입력 → AI는 업셀 이유만 생성
ALTER TABLE service_items
  ADD COLUMN IF NOT EXISTS tier_good_items   TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tier_better_items TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tier_best_items   TEXT[] DEFAULT '{}';
