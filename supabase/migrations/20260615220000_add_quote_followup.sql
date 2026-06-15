-- 견적 팔로업 자동화 — 발송 시각 추적
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS followup_sent_at  TIMESTAMPTZ,   -- D+1 팔로업 발송
  ADD COLUMN IF NOT EXISTS followup2_sent_at TIMESTAMPTZ;   -- D+3 팔로업 발송

COMMENT ON COLUMN quotes.followup_sent_at  IS '견적 D+1 팔로업 알림톡 발송 시각';
COMMENT ON COLUMN quotes.followup2_sent_at IS '견적 D+3 팔로업 알림톡 발송 시각';

CREATE INDEX IF NOT EXISTS idx_quotes_followup
  ON quotes(business_id, created_at, status)
  WHERE status = 'pending';
