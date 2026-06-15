CREATE TABLE IF NOT EXISTS b2b_quotes (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  quote_number TEXT,
  valid_until  TEXT,
  items        JSONB       NOT NULL DEFAULT '[]',
  total_amount INTEGER     NOT NULL DEFAULT 0,
  tax_included BOOLEAN     NOT NULL DEFAULT false,
  conditions   TEXT,
  site_name    TEXT,
  site_address TEXT,
  site_area    TEXT,
  frequency    TEXT,
  worker_count INTEGER,
  spec_content TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_quotes_lead_id     ON b2b_quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_business_id ON b2b_quotes(business_id);

ALTER TABLE b2b_quotes DISABLE ROW LEVEL SECURITY;
