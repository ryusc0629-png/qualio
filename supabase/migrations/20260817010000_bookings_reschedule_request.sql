-- 고객이 카카오톡 '일정 변경 요청' 버튼으로 새 일정을 제안할 수 있게 한다.
--
-- 왜 필요한가: 예약 확정 알림톡(V2)에 '일정 변경 요청' 버튼이 붙어 나가는데
-- 정작 그 버튼이 가리키는 화면이 없어서 고객이 누르면 404가 떴다(2026-08-17 발견).
--
-- 바로 바꾸지 않고 '요청'으로 받는 이유: 그 시간에 다른 현장이 잡혀 있을 수 있고
-- 기사 배정도 함께 움직여야 한다. 고객이 임의로 일정표를 바꾸면 사장님이 감당 못 한다.
alter table public.bookings
  add column if not exists reschedule_requested_at  timestamptz,
  add column if not exists reschedule_requested_for timestamptz,
  add column if not exists reschedule_note          text;

comment on column public.bookings.reschedule_requested_at is
  '고객이 일정 변경을 요청한 시각. 요청일 뿐이며 실제 변경은 사장님이 확정한다.';
comment on column public.bookings.reschedule_requested_for is
  '고객이 원하는 새 방문 일시(UTC).';
comment on column public.bookings.reschedule_note is
  '고객이 남긴 변경 사유. 사장님이 연락할 때 참고한다.';
