-- 구글 플레이스 URL 추가 (후기 링크)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS google_place_url TEXT;

-- 자동 후기 요청 발송 추적 (D+1, D+3)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS auto_review_sent_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_review_followup_sent_at TIMESTAMPTZ;

-- 크론 쿼리 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_bookings_auto_review
  ON bookings(business_id, status, scheduled_at)
  WHERE status = 'completed';
