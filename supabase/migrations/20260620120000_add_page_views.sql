-- page_views: 공개 페이지(견적 페이지·브랜드 홈) 방문 + 유입 소스 추적
-- post_views(블로그 글 전용)와 분리 — 웹사이트 전체 방문 통계용
CREATE TABLE IF NOT EXISTS page_views (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  page_type   text        NOT NULL,            -- 'quote' | 'brand_home'
  source      text        NOT NULL DEFAULT 'direct',
  viewed_at   timestamptz NOT NULL DEFAULT now()
);

-- 대시보드 통계 쿼리 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_page_views_business_id ON page_views(business_id);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at   ON page_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_page_type   ON page_views(page_type);

-- service_role 키만 접근 (RLS 불필요)
ALTER TABLE page_views DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  page_views           IS '공개 페이지(견적·브랜드 홈) 방문 로그 (유입 소스 포함)';
COMMENT ON COLUMN page_views.page_type IS 'quote(견적 페이지) | brand_home(브랜드 홈)';
COMMENT ON COLUMN page_views.source    IS 'ai_perplexity | ai_chatgpt | ai_claude | ai_you | google | naver | daum | direct | other';
