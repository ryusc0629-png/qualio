-- leads.status CHECK 제약에 'negotiating'(협의중)·'archived'(보관) 추가
-- 앱은 두 값을 쓰지만 기존 제약이 막고 있어 단계 변경/보관하기가 DB에서 실패했음
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'follow_up', 'quoted', 'negotiating', 'contracted', 'rejected', 'archived'));
