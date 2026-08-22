-- 월간 보고서의 '이번 달 청구' 금액을 사장님이 그 달만 고칠 수 있게 한다.
--
-- 왜 필요한가: 정기계약이 9월 4일에 시작하면 9월분은 한 달 치가 아니다.
-- 우리는 일수로 나눈 값을 기본으로 채워두지만, 일할 계산 방식은 업체마다 다르다
-- (일수 · 방문 횟수 · 반올림 단위 · 첫 달은 아예 안 받기 등).
-- 그래서 기본값은 자동으로 채우고, 다르면 그 달 금액만 덮어쓰게 한다.
--
-- null = 자동 계산값을 그대로 쓴다는 뜻. 0도 유효한 값이다(그 달은 청구 안 함).
-- 계약이 아니라 '그 달 그 거래처 보고서 한 건'에 붙는 값이라 여기(dispatches)에 둔다.
-- 계약에 넣으면 '이 날짜부터 이 금액'(price_history)과 뒤섞여 다음 달까지 바뀐다.

alter table public.monthly_report_dispatches
  add column if not exists charge_amount integer;

comment on column public.monthly_report_dispatches.charge_amount is
  '그 달 청구 금액(사장님이 직접 적은 값). null이면 계약 기준 자동 계산값을 쓴다.';
