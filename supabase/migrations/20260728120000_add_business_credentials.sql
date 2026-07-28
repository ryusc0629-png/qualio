-- businesses 전문성·신뢰 필드 — 숨고식 온보딩 벤치마킹(경력·사업자·자격증)
-- 홈페이지(/biz/[slug]) 상단 신뢰 앵커 + 완성도 온보딩 항목으로 노출
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS experience_years integer,                       -- 청소 경력 연차
  ADD COLUMN IF NOT EXISTS business_number  text,                          -- 사업자등록번호
  ADD COLUMN IF NOT EXISTS certifications   jsonb NOT NULL DEFAULT '[]'::jsonb; -- 자격증·인증·보유장비 문자열 배열

COMMENT ON COLUMN businesses.experience_years IS '청소 경력 연차 (홈페이지 전문성 노출)';
COMMENT ON COLUMN businesses.business_number  IS '사업자등록번호 (사업자 인증 배지)';
COMMENT ON COLUMN businesses.certifications   IS '자격증·인증·보유장비 문자열 배열(jsonb)';
