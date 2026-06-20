-- 예약 취소 사유 — 캘린더에서 취소 시 사유를 남겨
-- 고객 서비스 이력에 '왜 취소됐는지'를 함께 표시(CRM 활용)
alter table bookings add column if not exists cancellation_reason text;
