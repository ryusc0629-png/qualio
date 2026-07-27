-- 영업 동선 코스를 서버(DB)에 저장 → 폰·PC 어느 기기에서든 같은 코스가 보이도록
-- 업체당 마지막으로 짠 코스 1개만 유지(다시 짜면 덮어씀). 기존엔 브라우저 localStorage에만 있어 기기마다 달랐음.
create table if not exists business_roadmaps (
  business_id uuid primary key references businesses(id) on delete cascade,
  summary text not null default '',
  result jsonb not null,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 클라이언트 직접 접근 차단(서버는 service_role로 우회). 정책 없이 RLS만 켬.
alter table business_roadmaps enable row level security;
