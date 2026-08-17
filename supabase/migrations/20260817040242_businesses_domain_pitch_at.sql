-- 자체 도메인 연결을 권유하려고 마지막으로 연락한 시각
-- 없으면 아직 한 번도 얘기 안 꺼낸 업체다. 같은 사장님께 반복해서 전화하는 걸 막는다.
alter table public.businesses
  add column if not exists domain_pitch_at timestamptz;

comment on column public.businesses.domain_pitch_at is '자체 도메인 연결을 권유한 마지막 연락 시각(본사 영업용)';
