-- 홍보 페이지 히어로 제목/소개 (사장님 직접 작성, GEO SEO 필드와 독립)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS hero_title    TEXT,
  ADD COLUMN IF NOT EXISTS hero_subtitle TEXT;
