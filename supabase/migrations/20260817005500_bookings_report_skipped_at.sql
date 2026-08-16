-- 작업 보고서를 '안 보내고 넘김' 처리한 시각.
--
-- 보고서를 이미 만든 건은 reports.kakao_sent_at으로 넘김을 표시할 수 있지만,
-- 아직 보고서를 만들지 않은 예약은 표시할 곳이 없어 발송 목록에서 영원히 안 없어졌다.
-- (빈 보고서를 만들어 표시하면 고객 이력에 백지 '보고서 보기' 링크가 생기므로 예약 쪽에 남긴다)
--
-- 값이 있으면 알림톡 발송 목록과 홈 알림에서 빠진다.
alter table public.bookings
  add column if not exists report_skipped_at timestamptz;

comment on column public.bookings.report_skipped_at is '작업 보고서 발송을 건너뛴 시각 (알림톡 발송 목록에서 제외)';
