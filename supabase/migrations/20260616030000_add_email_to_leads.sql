ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN leads.email IS '담당자 이메일 주소 (선택)';
