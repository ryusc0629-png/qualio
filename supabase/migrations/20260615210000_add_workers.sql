-- 직원/도급사 테이블
CREATE TABLE workers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  phone       TEXT,
  type        TEXT        NOT NULL DEFAULT 'employee', -- 'employee' | 'contractor'
  color       TEXT        NOT NULL DEFAULT '#6366f1',  -- 캘린더 표시 색상
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- bookings에 작업자 배정 컬럼 추가
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id) ON DELETE SET NULL;
