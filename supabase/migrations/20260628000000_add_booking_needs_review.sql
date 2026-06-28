-- 변동형 서비스(에어컨 대수·줄눈 개수 등)가 번들에 포함돼 견적 시점에 금액을 확정할 수 없는
-- 예약을 '검토 필요'로 표시한다. 사장님이 통화로 대수/형태를 확인한 뒤 금액을 맞추도록 유도.
-- (견적→예약 전환 자체는 막지 않고 매끄럽게 두되, 확정 후 검토하도록 한다.)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

-- 검토 필요 예약을 빠르게 집계하기 위한 부분 인덱스 (true인 행만 색인)
CREATE INDEX IF NOT EXISTS bookings_needs_review_idx
  ON public.bookings (business_id)
  WHERE needs_review = true;
