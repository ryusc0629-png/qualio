-- "기사가 출발했어요"(On My Way) 알림 — Housecall Pro 벤치마킹.
-- 고객마다 필요/불필요가 갈리므로 고객별 수신 설정 + 예약별 발송 추적을 둔다.

-- 고객별 수신 설정 (기본 켜짐 — 원치 않는 고객은 사장님이 끔)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notify_on_my_way boolean NOT NULL DEFAULT true;

-- 예약별 출발 알림 발송 시각 (중복 발송 방지·'보냄' 표시)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS on_my_way_sent_at timestamptz;
