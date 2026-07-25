-- 자동 발행 계획표 고정 저장: 월초 1회 확정 후 불변
-- (달력 미리보기·크론 자동발행·수동 '지금 발행'이 모두 동일한 고정 계획을 따르게 함)
alter table businesses add column if not exists post_plan jsonb;
alter table businesses add column if not exists post_plan_month text;
comment on column businesses.post_plan is '이번 달 자동 발행 계획표(고정). { month, slots: [{day, label, topic, keyword, geoTargeted, monthlySearches?, competition?}] }';
comment on column businesses.post_plan_month is '계획표가 확정된 월(YYYY-MM, KST). 이 값이 이번 달과 같으면 재생성하지 않음.';
