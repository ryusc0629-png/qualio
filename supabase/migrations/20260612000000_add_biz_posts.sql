-- ============================================================
-- biz_posts: 업체 랜딩 페이지용 블로그 포스트
-- GEO/AEO 최적화를 위해 콘텐츠를 꾸준히 쌓는 용도
-- ============================================================

create table biz_posts (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  slug         text not null,
  title        text not null,
  content      text not null,          -- 마크다운 or 일반 텍스트
  summary      text,                   -- 목록/메타 description 용 요약
  image_url    text,                   -- 대표 이미지 (Supabase Storage URL)
  ai_generated boolean not null default false,
  published    boolean not null default true,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, slug)
);

-- updated_at 자동 갱신 트리거
create trigger biz_posts_updated_at
  before update on biz_posts
  for each row execute function update_updated_at();

-- 조회 성능 인덱스
create index biz_posts_business_published_idx
  on biz_posts (business_id, published_at desc)
  where published = true;
