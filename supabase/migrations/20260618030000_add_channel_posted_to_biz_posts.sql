-- 채널(네이버/당근/인스타) 수동 업로드 완료 추적
-- null = 아직 안 올림(할 일), 값 있음 = 사장님이 "올렸어요"로 완료 처리한 시각

ALTER TABLE biz_posts
  ADD COLUMN IF NOT EXISTS channel_posted_at timestamptz;

-- 기존 글은 모두 완료 처리해 깨끗하게 시작 (새로 발행되는 글부터 '할 일'로 표시)
UPDATE biz_posts SET channel_posted_at = now() WHERE channel_posted_at IS NULL;

-- 채널 업로드 대기 글 빠른 집계 (메인 대시보드 KPI용)
CREATE INDEX IF NOT EXISTS biz_posts_channel_todo_idx
  ON biz_posts (business_id, published) WHERE channel_posted_at IS NULL AND post_type <> 'portfolio';
