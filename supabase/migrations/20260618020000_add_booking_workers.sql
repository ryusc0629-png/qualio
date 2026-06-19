-- 한 예약에 여러 직원/도급사를 배정하기 위한 다대다 중간 테이블
CREATE TABLE IF NOT EXISTS booking_workers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  worker_id  UUID        NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  is_lead    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id, worker_id)
);

ALTER TABLE booking_workers ENABLE ROW LEVEL SECURITY;

-- 기존 bookings.worker_id 데이터를 booking_workers로 이전
INSERT INTO booking_workers (booking_id, worker_id, is_lead)
SELECT id, worker_id, true
FROM bookings
WHERE worker_id IS NOT NULL
ON CONFLICT DO NOTHING;
