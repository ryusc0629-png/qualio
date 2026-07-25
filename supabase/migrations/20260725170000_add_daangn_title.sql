-- 당근마켓 원고에 별도 제목 필드 추가
-- 네이버 블로그(naver_title)처럼 제목을 맨 앞에 따로 노출해, 당근 목록·미리보기에서
-- 첫 줄이 제목처럼 보이도록 한다. 기존 글은 daangn_title이 null이라 본문만 노출(호환).
alter table public.biz_posts
  add column if not exists daangn_title text;
