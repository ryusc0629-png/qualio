-- 네이버 블로그용 변환 콘텐츠 저장
ALTER TABLE biz_posts
  ADD COLUMN IF NOT EXISTS naver_title TEXT,
  ADD COLUMN IF NOT EXISTS naver_content TEXT,
  ADD COLUMN IF NOT EXISTS naver_tags TEXT[];
