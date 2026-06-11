-- 업체별 월간 자동 포스팅 목표 건수
-- 0 = 자동 발행 꺼짐, 1 이상 = 매월 해당 건수만큼 자동 발행
alter table public.businesses
  add column if not exists monthly_post_target integer not null default 0;
