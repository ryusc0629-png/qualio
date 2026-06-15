-- post_views: GEO 포스트 조회수 + 유입 소스 추적
CREATE TABLE IF NOT EXISTS post_views (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     uuid        NOT NULL REFERENCES biz_posts(id) ON DELETE CASCADE,
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source      text        NOT NULL DEFAULT 'direct',
  viewed_at   timestamptz NOT NULL DEFAULT now()
);

-- 대시보드 통계 쿼리 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_post_views_business_id ON post_views(business_id);
CREATE INDEX IF NOT EXISTS idx_post_views_post_id     ON post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_viewed_at   ON post_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_source      ON post_views(source);

-- service_role 키만 접근 (RLS 불필요)
ALTER TABLE post_views DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  post_views        IS 'GEO 포스트 페이지 조회 로그 (유입 소스 포함)';
COMMENT ON COLUMN post_views.source IS 'ai_perplexity | ai_chatgpt | ai_claude | ai_you | google | naver | direct | other';
