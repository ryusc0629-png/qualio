-- 회원(업체)의 대시보드 사용 행태 추적
-- 본사가 "가입한 사장님들이 실제로 어떤 화면을 얼마나 쓰는지"를 파악하기 위한 로그.
-- 로그인한 회원이 대시보드 화면(경로)을 열 때마다 1행씩 쌓인다.
-- (관리자 본인의 사용은 API 단에서 제외하므로 여기엔 회원 사용만 남는다.)
create table if not exists public.activity_events (
  id          uuid primary key default gen_random_uuid(),
  -- 어느 업체(회원)의 사용인지
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- 실제 조작한 사용자 (대표 또는 소속 직원) — 유저 삭제돼도 기록은 남기려 set null
  user_id     uuid,
  -- 열람한 화면 경로 (예: /dashboard/schedule) — 쿼리스트링은 API에서 제거 후 저장
  path        text not null,
  created_at  timestamptz not null default now()
);

-- 업체별 최근 사용 조회 최적화 (최근순)
create index if not exists idx_activity_events_business_created
  on public.activity_events (business_id, created_at desc);
-- 전체 최신순 피드 조회 최적화
create index if not exists idx_activity_events_created
  on public.activity_events (created_at desc);

-- RLS 켜고 정책은 두지 않는다 → service_role(본사 서버)로만 읽고 쓴다.
alter table public.activity_events enable row level security;
