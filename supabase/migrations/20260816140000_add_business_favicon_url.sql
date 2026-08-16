-- 고객사 홈페이지의 브라우저 탭 아이콘(파비콘)을 업체별로 설정할 수 있게 한다.
-- 비어 있으면 로고(logo_url)를 쓰고, 로고도 없으면 업체명 첫 글자로 자동 생성한다.
-- (기존 컬럼 추가라 RLS는 businesses 테이블에 이미 적용되어 있음)
alter table public.businesses
  add column if not exists favicon_url text;

comment on column public.businesses.favicon_url is '홍보 페이지 파비콘 이미지 URL. null이면 logo_url → 업체명 첫 글자 순으로 대체';
