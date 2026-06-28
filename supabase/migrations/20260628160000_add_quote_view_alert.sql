-- 견적서 열람 핫리드 푸시 중복 방지용 — view_alert_sent_at
--
-- 왜 필요한가(Jobber/Housecall Pro 방식):
--   Jobber는 고객이 견적서를 "열람"하면 대표에게 푸시("고객이 견적을 봤어요")를 보내
--   뜨거울 때 바로 연락하게 한다. 퀄리오도 quote_viewed 이벤트로 같은 신호를 잡되,
--   고객이 새로고침할 때마다 푸시가 쏟아지지 않도록 견적당 1회만 보내야 한다.
--   이 컬럼이 "이 견적은 이미 열람 알림을 보냈다"를 기록해 중복을 막는다.

alter table quotes
  add column if not exists view_alert_sent_at timestamptz;
