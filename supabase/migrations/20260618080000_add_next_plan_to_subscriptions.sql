-- 플랜 변경 예약: 현재 기간 만료 후 적용될 플랜
alter table subscriptions add column if not exists next_plan text default null;
