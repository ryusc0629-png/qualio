-- 정기계약(contracts)이 미래 방문(bookings)을 일정에 자동 생성하도록 지원.
-- Jobber/Housecall Pro의 'recurring job → 방문 자동 생성'에 해당.

-- 계약별로 '어느 날짜까지 방문을 생성했는지' 커서 — 멱등 생성·취소건 재생성 방지에 사용
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS last_generated_until date;

-- 자동 생성된 방문을 계약과 연결 (계약 삭제 시 방문은 남기고 연결만 해제)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- 계약별 방문 조회·중복 확인용 부분 인덱스
CREATE INDEX IF NOT EXISTS bookings_contract_id_idx
  ON public.bookings (contract_id)
  WHERE contract_id IS NOT NULL;
