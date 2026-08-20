-- ============================================================
-- 현장 요청에 '처리했음' 표시를 붙인다 (bookings.customer_request_done_at)
--
-- 왜 필요한가: 거래처 월간 보고서 상단 지표가 우리를 실제보다 나쁘게 보이게 하고 있었다.
--   요청사항 = 클레임 + 현장 요청   (분모)
--   처리     = 클레임 중 처리된 것   (분자)
-- 현장 요청은 처리 여부를 적을 칸 자체가 없어서 분자에 절대 못 들어갔다.
-- 그래서 직원이 현장 요청을 성실히 적을수록 거래처 눈에는 "요청 10건 · 처리 2건"으로 보였다.
--
-- ⚠️ 현장 직원 입력은 늘리지 않는다. 체크는 사장님이 월간 리포트를 보내기 전
--    검토 화면에서 누른다(어차피 그때 보고 있다). [[project_field_app]] 원칙 유지.
-- ============================================================

alter table public.bookings
  add column if not exists customer_request_done_at timestamptz;

comment on column public.bookings.customer_request_done_at is
  '현장 요청(customer_request)을 처리한 시각. null이면 아직 처리 표시를 안 한 것';
