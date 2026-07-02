-- B2B 견적서/시방서 공개 링크 + 조회 추적
-- 목적: 사장님이 링크를 발송하고, 계약 전 고객이 견적서/시방서를 다시 열어볼 때 재열람 알림을 받기 위함
--   (B2C 소비자 견적의 quote_funnel_events + view_alert_sent_at 방식을 B2B 문서에 맞게 이식)

ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS public_token       UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS first_viewed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_viewed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS view_count         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_alert_sent_at TIMESTAMPTZ;

-- 기존 견적에도 공개 토큰 채우기 (링크 발송 가능하도록)
UPDATE b2b_quotes SET public_token = gen_random_uuid() WHERE public_token IS NULL;

-- 토큰으로 공개 조회하므로 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_b2b_quotes_public_token ON b2b_quotes(public_token);
