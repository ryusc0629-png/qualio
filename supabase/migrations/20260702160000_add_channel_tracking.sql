-- 마케팅 채널별 유입 추적
-- 홍보 링크에 ?ch=<채널> 를 붙여 배포 → 방문/퍼널에 채널을 함께 기록
-- referrer 추측이 아니라 확정값이므로 당근·인스타처럼 referrer가 안 잡히는 채널도 정확히 분리됨
ALTER TABLE page_views          ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE quote_funnel_events ADD COLUMN IF NOT EXISTS channel text;

-- 채널별 집계 최적화
CREATE INDEX IF NOT EXISTS idx_page_views_channel ON page_views(channel);

COMMENT ON COLUMN page_views.channel          IS '마케팅 채널 태그(?ch=) — naver_place | naver_blog | instagram | danggeun | kakao | flyer 등, 없으면 NULL';
COMMENT ON COLUMN quote_funnel_events.channel IS '마케팅 채널 태그(?ch=) — page_views.channel과 동일 규칙';
