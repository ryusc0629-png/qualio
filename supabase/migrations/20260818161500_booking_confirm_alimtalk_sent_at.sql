-- 예약 확정 알림톡을 언제 보냈는지 예약 자체에 기록한다.
--
-- 왜 필요한가 (두 가지):
-- 1) 사장님이 "고객한테 카톡이 나갔나?"를 확인할 방법이 화면에 하나도 없었다.
--    예약 상세에서 발송 내역을 보여주려면 예약 확정 알림톡에도 발송 시각이 있어야 한다.
-- 2) 지금까지는 이 시각을 reports.kakao_sent_at 에 적고 있었는데, 그 칸은 원래
--    '작업 보고서 알림톡' 발송 시각이다. 예약을 확정하는 순간 보고서를 보낸 것처럼
--    기록돼서, 그 예약은 /dashboard/alimtalk-todo(알림톡 발송 대기 목록)에서 아예 빠졌다.
--    → 작업이 끝나도 사장님에게 "보고서 보내세요"가 안 뜬다.

alter table public.bookings
  add column if not exists confirm_alimtalk_sent_at timestamptz;

comment on column public.bookings.confirm_alimtalk_sent_at is
  '예약 확정 알림톡을 고객에게 보낸 시각. 예약 상세의 발송 내역 표시에 쓴다.';

-- 이미 쌓인 오염분 정리:
-- 예약 확정 때 만들어진 껍데기 보고서(내용·사진·리뷰요청 전부 없음)는
-- 발송 시각을 예약 쪽으로 옮기고, 보고서 발송 기록은 비워 대기 목록에 다시 잡히게 한다.
update public.bookings b
set confirm_alimtalk_sent_at = r.kakao_sent_at
from public.reports r
where r.booking_id = b.id
  and b.confirm_alimtalk_sent_at is null
  and r.kakao_sent_at is not null
  and r.notes is null
  and r.preventive_note is null
  and r.review_request_sent_at is null
  and not exists (select 1 from public.report_photos p where p.report_id = r.id);

delete from public.reports r
where r.kakao_sent_at is not null
  and r.notes is null
  and r.preventive_note is null
  and r.review_request_sent_at is null
  and not exists (select 1 from public.report_photos p where p.report_id = r.id);
