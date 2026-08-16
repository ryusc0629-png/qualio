-- 예약 리마인더를 두 번 보내지 않기 위한 발송 기록.
--
-- 왜 필요한가: /api/cron/remind 에는 중복 방지 장치가 없어서, 크론이 재시도되거나
-- 손으로 한 번 더 부르면 같은 고객이 "내일 방문합니다" 안내를 두 번 받는다.
-- (이 크론은 vercel.json에도 daily-maintenance 목록에도 없어 여태 한 번도 돈 적이 없었고,
--  2026-08-16에 연결하면서 함께 막았다.)
alter table public.bookings
  add column if not exists reminder_sent_at timestamptz;

comment on column public.bookings.reminder_sent_at is
  '예약 하루 전 리마인더 알림톡을 보낸 시각. 크론이 두 번 돌아도 고객이 같은 안내를 두 번 받지 않게 하는 기록.';
