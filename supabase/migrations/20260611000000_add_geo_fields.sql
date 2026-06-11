-- ============================================================
-- GEO/AEO 자동화 — businesses 테이블 SEO 컬럼 추가
-- slug: /biz/[slug] 공개 랜딩 URL
-- seo_title/description/keywords: AI 자동 생성
-- seo_faqs: JSON 배열 (질문/답변 쌍)
-- ============================================================

alter table public.businesses
  add column if not exists slug             text unique,
  add column if not exists seo_title        text,
  add column if not exists seo_description  text,
  add column if not exists seo_keywords     text,
  add column if not exists seo_faqs         jsonb default '[]'::jsonb,
  add column if not exists seo_generated_at timestamptz;

-- slug 인덱스 (공개 페이지 조회 성능)
create index if not exists businesses_slug_idx on public.businesses (slug);

-- 기존 업체에 slug 자동 생성 (임시: id 앞 8자리 사용)
update public.businesses
set slug = substring(replace(id::text, '-', ''), 1, 12)
where slug is null;
