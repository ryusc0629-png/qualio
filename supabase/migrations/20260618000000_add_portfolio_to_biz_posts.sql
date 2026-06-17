-- 포트폴리오(시공 사례) 포스트 지원을 위한 biz_posts 확장
-- post_type: 'geo'(기존 AI GEO 글), 'portfolio'(보고서 기반 시공 사례)

ALTER TABLE biz_posts
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'geo',
  ADD COLUMN IF NOT EXISTS source_report_id uuid REFERENCES reports(id),
  ADD COLUMN IF NOT EXISTS before_image_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS after_image_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reel_url text;

-- 동일 보고서에서 포트폴리오 중복 생성 방지
CREATE UNIQUE INDEX IF NOT EXISTS biz_posts_source_report_id_idx
  ON biz_posts (source_report_id) WHERE source_report_id IS NOT NULL;

-- 포트폴리오 포스트 빠른 조회
CREATE INDEX IF NOT EXISTS biz_posts_portfolio_idx
  ON biz_posts (business_id, post_type, published) WHERE post_type = 'portfolio';
