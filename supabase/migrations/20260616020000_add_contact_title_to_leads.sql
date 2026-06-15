ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contact_title TEXT;

COMMENT ON COLUMN leads.contact_title IS '담당자 직함/직급 (예: 대표이사, 총무팀장)';
