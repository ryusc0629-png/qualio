-- 메모 최종 저장자 추적 (팀 작업 시 덮어쓰기 방지 및 책임 추적)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS memo_updated_by  UUID        REFERENCES workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS memo_updated_at  TIMESTAMPTZ;
