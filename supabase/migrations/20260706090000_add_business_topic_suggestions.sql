-- 자동 발행 주제 추천을 '월 단위'로 서버에 고정 저장
-- 기존에는 주제를 브라우저(localStorage)에 주 단위로만 캐시해서, 매주·기기마다
-- AI(Claude)를 다시 호출해 토큰을 소모했다. 이제 월 초에 한 번 생성하면
-- 그 달 내내(모든 기기에서) 같은 주제를 재사용한다.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS topic_suggestions jsonb,          -- 추천 주제 목록(JSON 배열)
  ADD COLUMN IF NOT EXISTS topic_suggestions_month text;     -- 생성된 달 'YYYY-MM'
