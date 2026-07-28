-- 계약서 본문 — 표준 문안을 자동 채운 뒤 사장님이 자유 편집(시방서 spec_content와 동일 패턴)
ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS contract_content text;
