-- 작업 보고를 공개 홈페이지 "시공 사례" 갤러리에 노출할지 여부 (사장님이 보고서 화면에서 켬)
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- 갤러리 조회용 — 공개된 보고서만 빠르게
CREATE INDEX IF NOT EXISTS reports_public_idx
  ON reports (business_id, created_at DESC) WHERE is_public;
