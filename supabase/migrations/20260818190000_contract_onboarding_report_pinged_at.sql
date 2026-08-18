-- 초도 리포트 '보낼 차례예요' 푸시를 계약당 한 번만 보내기 위한 기록.
--
-- 왜 필요한가: 첫 작업이 끝났는데 리포트를 안 보낸 계약은 보낼 때까지 계속 조건에 걸린다.
-- 기록이 없으면 매일 같은 푸시가 가서 대표님이 알림을 꺼버리게 된다.

alter table public.contracts
  add column if not exists onboarding_report_pinged_at timestamptz;

comment on column public.contracts.onboarding_report_pinged_at is
  '초도 리포트를 보내라고 대표에게 푸시한 시각. 계약당 한 번만 알리기 위한 기록.';
