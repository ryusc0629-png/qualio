-- 거래처 월간 작업 리포트 '검토 후 발송' 대기열
-- 매월 초 지난달 리포트를 자동 준비(pending)해 대표가 검토·발송하게 한다.
-- (period, customer) 유니크로 같은 달 리포트가 중복 생성되지 않게 막는다.
CREATE TABLE IF NOT EXISTS public.monthly_report_dispatches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id     UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  period          TEXT        NOT NULL,                       -- 리포트 대상 달 'YYYY-MM'
  status          TEXT        NOT NULL DEFAULT 'pending'      -- pending(검토대기) / sent(발송완료) / skipped(건너뜀)
                    CHECK (status IN ('pending', 'sent', 'skipped')),
  completed_visits INTEGER    NOT NULL DEFAULT 0,             -- 준비 시점의 그달 완료 방문 수(목록 표시용)
  sent_at         TIMESTAMPTZ,                                -- 발송/처리 시각
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, customer_id, period)
);

CREATE INDEX IF NOT EXISTS idx_mrd_business_status
  ON public.monthly_report_dispatches(business_id, status);

ALTER TABLE public.monthly_report_dispatches ENABLE ROW LEVEL SECURITY;
