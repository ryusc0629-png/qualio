-- 네이버 블로그 연동 정보 추가
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS naver_blog_id TEXT,
  ADD COLUMN IF NOT EXISTS naver_blog_api_key TEXT;
