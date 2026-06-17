-- ============================================================
-- 고객사 웹사이트 브랜드 커스터마이징 (Jobber 수준)
-- biz/[slug] 공개 페이지의 색상·히어로 스타일을 업체별로 지정
-- 로고(logo_url)는 기존 컬럼 재사용
-- ============================================================

alter table businesses
  -- 대표(메인) 강조색 — 페이지 전체 primary 토큰을 덮어씀. HEX 예: #2563eb
  add column if not exists brand_color           text,
  -- 서브 강조색 — 히어로 보조 글로우 등에 사용. HEX 예: #f59e0b
  add column if not exists brand_color_secondary text,
  -- 히어로 배경 스타일: 'dark'(기본) | 'light'
  add column if not exists hero_style            text not null default 'dark'
    check (hero_style in ('dark', 'light'));

comment on column businesses.brand_color           is '고객사 웹사이트 대표 강조색 (HEX)';
comment on column businesses.brand_color_secondary is '고객사 웹사이트 서브 강조색 (HEX)';
comment on column businesses.hero_style            is '히어로 배경 스타일 (dark | light)';
