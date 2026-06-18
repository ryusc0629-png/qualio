-- 사장님이 직접 입력하는 추천사 (최대 3개, [{quote, author}] 형태)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS testimonials JSONB DEFAULT '[]';
