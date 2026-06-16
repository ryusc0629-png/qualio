-- biz_posts에 다중 이미지 저장용 컬럼 추가
-- 네이버 상위노출을 위해 포스트당 여러 장(기본 3장)의 이미지를 저장한다.
-- 대표 이미지는 기존 image_url 유지(랜딩/목록 호환), 전체 목록은 image_urls 배열에 저장.
-- 게시물당 1회만 생성: image_urls가 비어있지 않으면 재생성을 막는다(앱 로직).

alter table public.biz_posts
  add column if not exists image_urls text[] not null default '{}';

comment on column public.biz_posts.image_urls is
  '포스트 이미지 URL 배열 (대표 = image_url, 전체 = image_urls). 게시물당 1회 생성.';
