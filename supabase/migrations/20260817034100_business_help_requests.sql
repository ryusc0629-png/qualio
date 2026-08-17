-- 사장님이 "이거 대신 해주세요" 하고 누르는 대행 요청함
--
-- 왜 필요한가: 도메인 구입·DNS 설정, 네이버·구글 검색 등록은 비테크 사장님(40~60대)이
-- 혼자 끝내기 어렵다. 안내 문서를 잘 써도 중간에서 막히고 결국 전화가 온다.
-- 버튼 하나로 접수받아 본사가 대신 처리하고, 사장님 화면에는 진행 상태만 보여준다.
create table if not exists public.business_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- 'domain_setup' 내 주소 마련·연결 대행 | 'search_indexing' 네이버·구글 검색 등록 대행
  kind text not null,
  -- 'requested' 접수 | 'in_progress' 처리 중 | 'done' 완료
  status text not null default 'requested',
  -- 사장님이 남긴 메모(원하는 주소 후보 등)
  note text,
  -- 본사가 남기는 처리 메모
  admin_note text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

alter table public.business_requests enable row level security;

-- 같은 종류로 아직 안 끝난 요청이 두 건 쌓이지 않게 (버튼 연타 방지)
create unique index if not exists business_requests_open_uniq
  on public.business_requests (business_id, kind)
  where status <> 'done';

create index if not exists business_requests_status_idx
  on public.business_requests (status, created_at desc);
