-- 사장님이 검색 키워드를 직접 고친 시각.
--
-- 홍보 페이지 문구를 밤마다 자동으로 다시 만들게 되면서, 손으로 정리해 둔 키워드까지
-- 같이 덮이면 "고쳐도 다음 날 되돌아간다"가 된다. 이 값이 찍혀 있으면 자동 재생성이
-- 키워드만 건드리지 않고 넘어간다(제목·소개글·FAQ는 새로 만든다).

alter table public.businesses
  add column if not exists seo_keywords_edited_at timestamptz;

comment on column public.businesses.seo_keywords_edited_at is
  '사장님이 검색 키워드를 직접 고친 시각. 값이 있으면 자동 재생성이 키워드를 덮지 않는다';

-- businesses 는 이미 RLS 가 켜져 있다. 컬럼 추가라 정책 변경 없음.
