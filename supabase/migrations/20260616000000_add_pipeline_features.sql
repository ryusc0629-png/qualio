-- leads 테이블 확장: 거래처 타입 + 예상 월 금액
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS customer_type  TEXT NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS monthly_budget INTEGER;

COMMENT ON COLUMN leads.customer_type  IS 'company(거래처) | individual(일반 고객)';
COMMENT ON COLUMN leads.monthly_budget IS '예상 월 청소비 (원)';

-- 상담 기록 테이블
CREATE TABLE IF NOT EXISTS lead_activities (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL DEFAULT 'note', -- call | visit | quote | note
  content      TEXT,
  activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id     ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_business_id ON lead_activities(business_id);

ALTER TABLE lead_activities DISABLE ROW LEVEL SECURITY;
