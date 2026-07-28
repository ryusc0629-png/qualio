-- 사업자등록증상 상호(법적 상호) — 브랜드명(name)과 다를 때 계약서·세금계산서에 사용.
-- 비워두면 name(브랜드명)으로 폴백.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS legal_name text;
