-- 영수증 알림톡이 나간 시각.
--
-- 다른 알림톡 5종(confirm_alimtalk_sent_at·reminder_sent_at·on_my_way_sent_at 등)은
-- 이미 시각을 남기는데 영수증만 빠져 있었다. 그래서 "영수증이 나갔나?"를
-- 확인할 방법이 화면에도 DB에도 없었다.
--
-- 이 값이 채워지면 예약 상세의 '고객에게 보낸 카톡'에 한 줄로 뜨고,
-- 비어 있을 때만 다시 보내기 버튼이 나타난다.
alter table public.bookings
  add column if not exists receipt_sent_at timestamptz;
