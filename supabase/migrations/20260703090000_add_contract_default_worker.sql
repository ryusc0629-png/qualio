-- 정기계약(거래처)의 고정 담당자
-- 정기 청소는 한 담당자가 고정으로 맡는 게 기본값. 이 값이 있으면
-- 앞으로 자동 생성되는 정기 방문(bookings)이 이 담당자에게 바로 배정된다.
-- 담당자(worker)가 삭제되면 자동으로 NULL 처리(미배정).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS default_worker_id UUID
    REFERENCES public.workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_default_worker
  ON public.contracts(default_worker_id);
