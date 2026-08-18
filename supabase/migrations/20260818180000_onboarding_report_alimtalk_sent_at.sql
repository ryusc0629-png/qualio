-- 초도(첫 작업) 보고서를 거래처에 카톡으로 보낸 시각.
--
-- 왜 필요한가: 초도 보고서는 '완성·저장'만 있고 발송 기능이 없었다(알림톡 함수는
-- 만들어져 있었는데 부르는 곳이 없었다). 사장님이 검토 후 직접 보내는 버튼을 다는데,
-- 두 번 눌러 두 번 가지 않게 발송 시각을 기록한다.

alter table public.onboarding_reports
  add column if not exists alimtalk_sent_at timestamptz;

comment on column public.onboarding_reports.alimtalk_sent_at is
  '초도 보고서를 거래처에 카카오 알림톡으로 보낸 시각. 사장님이 검토 후 직접 누른 시점.';
