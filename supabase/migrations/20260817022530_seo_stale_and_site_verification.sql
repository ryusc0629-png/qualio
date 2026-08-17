-- 홍보 페이지 문구(제목·소개글·검색 키워드)가 낡았는지 표시하는 시각.
--
-- seo_title/seo_description 은 '홍보 페이지 만들기'를 누른 그 순간의 스냅샷이라,
-- 서비스를 바꾸거나 주력 고객(상가/가정집)을 바꿔도 다시 만들어지지 않는다.
-- 실제로 다트클린은 정기청소를 등록하기 이틀 전에 찍힌 "입주청소·에어컨청소" 제목이
-- 한 달 내내 검색에 그대로 노출됐다(2026-07-28 생성 → 07-30 서비스 추가).
-- 그래서 재료가 바뀐 시각을 남겨 두고, seo_generated_at 보다 나중이면
-- 대시보드에서 "다시 만들어 주세요"를 띄운다.
--
-- ※ naver_site_verification / google_site_verification 은 같은 날 별도 마이그레이션
--   (20260817022501_add_search_console_verification_columns.sql)에서 추가됐다.

alter table public.businesses
  add column if not exists seo_stale_at timestamptz;

comment on column public.businesses.seo_stale_at is
  '서비스·주력고객 등 홍보 페이지 재료가 마지막으로 바뀐 시각. seo_generated_at 보다 나중이면 문구가 낡은 것';

-- businesses 는 이미 RLS 가 켜져 있다. 컬럼 추가라 정책 변경 없음.
