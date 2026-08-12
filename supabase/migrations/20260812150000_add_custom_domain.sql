-- 고객사 자체 도메인 연결
--
-- 왜 필요한가: 지금은 모든 고객사 홈페이지가 qualio.co.kr/biz/{slug} 한 도메인 아래에 있다.
-- 고객사가 늘어 같은 지역 업체가 겹치면 한 도메인 안에서 같은 키워드로 서로 경쟁하게 되고
-- (검색엔진은 한 키워드에 한 도메인 결과를 1~2개만 노출), 한 업체가 저품질 판정을 받으면
-- 도메인 전체가 눌린다. 고객사 도메인으로 페이지를 띄우면 이 두 문제가 함께 사라진다.
--
-- custom_domain_status
--   none    — 연결 안 함(기본)
--   pending — 퀄리오 Vercel 프로젝트에는 등록됐지만 아직 DNS가 안 잡힘(사장님이 DNS 설정 중)
--   active  — DNS 검증까지 끝나 실제로 그 주소로 홈페이지가 뜸

alter table public.businesses
  add column if not exists custom_domain              text,
  add column if not exists custom_domain_status       text not null default 'none',
  add column if not exists custom_domain_connected_at timestamptz;

comment on column public.businesses.custom_domain is '고객사 자체 도메인(호스트만·소문자, 예: bkclean.co.kr). 없으면 null';
comment on column public.businesses.custom_domain_status is 'none | pending | active';
comment on column public.businesses.custom_domain_connected_at is 'DNS 검증까지 끝나 active가 된 시각';

-- 한 도메인은 한 업체에만 — 호스트로 업체를 찾는 조회의 인덱스도 겸한다
create unique index if not exists businesses_custom_domain_key
  on public.businesses (custom_domain)
  where custom_domain is not null;
