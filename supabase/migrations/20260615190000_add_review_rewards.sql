-- 후기 보상 설정 (업체별)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS review_reward_type        TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_reward_description TEXT;

COMMENT ON COLUMN businesses.review_reward_type        IS 'none | discount | other';
COMMENT ON COLUMN businesses.review_reward_description IS '사장님이 직접 입력하는 보상 내용 (예: 다음 방문 10% 할인)';

-- 후기 인증 클레임 (고객이 후기 남기기 버튼 클릭 추적)
CREATE TABLE IF NOT EXISTS review_claims (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id   UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_phone TEXT      NOT NULL,
  token        TEXT        NOT NULL UNIQUE,
  is_followup  BOOLEAN     NOT NULL DEFAULT false,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicked_at   TIMESTAMPTZ,   -- 인증 페이지 방문
  claimed_at   TIMESTAMPTZ,   -- "후기 남겼어요" 버튼 클릭
  reward_sent_at TIMESTAMPTZ  -- 사장님이 보상 발송 완료 처리
);

CREATE INDEX IF NOT EXISTS idx_review_claims_token       ON review_claims(token);
CREATE INDEX IF NOT EXISTS idx_review_claims_business_id ON review_claims(business_id);
CREATE INDEX IF NOT EXISTS idx_review_claims_booking_id  ON review_claims(booking_id);

ALTER TABLE review_claims DISABLE ROW LEVEL SECURITY;
