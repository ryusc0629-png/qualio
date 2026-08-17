-- 검색엔진 소유확인(색인 등록)용 인증 코드
-- 네이버 서치어드바이저 / 구글 서치콘솔이 발급하는 meta 태그 content 값을 업체별로 보관한다.
-- 고객사 자체 도메인 홈페이지 <head>에 그대로 출력된다(app/biz/[slug]/page.tsx).
alter table public.businesses
  add column if not exists naver_site_verification text,
  add column if not exists google_site_verification text;

comment on column public.businesses.naver_site_verification is '네이버 서치어드바이저 소유확인 코드 (meta naver-site-verification content 값)';
comment on column public.businesses.google_site_verification is '구글 서치콘솔 소유확인 코드 (meta google-site-verification content 값)';
