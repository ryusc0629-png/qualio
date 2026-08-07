-- 급여 계산: 직원/도급사별 단가
-- pay_type: 'hourly'(시급) | 'daily'(일급) | 'per_visit'(건당)
-- pay_rate: 단가(원). 근무시간(시급)·근무일수(일급)·방문건수(건당)에 곱해 급여를 계산한다.
alter table public.workers add column if not exists pay_type text;
alter table public.workers add column if not exists pay_rate integer;

comment on column public.workers.pay_type is '급여 방식: hourly(시급)/daily(일급)/per_visit(건당)';
comment on column public.workers.pay_rate is '단가(원) — 방식에 곱해 급여 계산';
