-- 홍보 영상에 붙는 채널 문구를 보고서 자체에 저장한다.
--
-- 🔴버그: 채널 문구를 '그 보고서에서 승인된 시공 사례'에서 가져오게 만들었다. 그런데 시공 사례
-- 승인은 별개 흐름이라 대부분 안 돼 있다(운영 확인: 릴스 2편 모두 연결된 사례가 없음).
-- 그래서 채널 버튼(인스타·틱톡·쇼츠·네이버 클립)이 아예 안 그려졌다.
-- 캡션은 영상에 붙는 것이지 사례에 붙는 게 아니다 — 남의 흐름에 의존시키면 안 된다.
--
-- 모양: {"searchTitle":"...","searchTags":[...],"body":"...","bodyTags":[...]}
-- (시공 사례는 naver_title·naver_tags·instagram_content·instagram_hashtags를 그대로 쓴다)
alter table public.reports
  add column if not exists reel_caption jsonb;
