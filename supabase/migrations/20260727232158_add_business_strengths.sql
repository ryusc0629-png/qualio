-- 업체별 강점(특장점) — 사장님이 직접 켜고 문구를 다듬는 항목
-- 홈페이지 "○○만의 차이" 섹션에 자동 반영. [{key, title, desc}] 형태(최대 6개)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS strengths JSONB DEFAULT '[]';
