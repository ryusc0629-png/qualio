-- 당근마켓 비즈프로필 주소 (마케팅 '당근 열기' 버튼 연결용)
-- danggeun_review_url(후기 수집용)과 용도가 달라 별도 컬럼으로 분리
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS danggeun_business_url text;

COMMENT ON COLUMN businesses.danggeun_business_url IS '당근마켓 비즈프로필 주소 — 마케팅 포스팅 "당근 열기" 버튼이 이 주소로 연결';
