-- 재방문 유도 자동화 — 고객별 발송 추적
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS reengagement_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN customers.reengagement_sent_at IS '마지막 방문 90일 후 재방문 유도 알림톡 발송 시각';

CREATE INDEX IF NOT EXISTS idx_customers_reengagement
  ON customers(business_id, reengagement_sent_at)
  WHERE reengagement_sent_at IS NULL;
