-- 현장 직원이 올린 특이사항과 사장님이 등록한 클레임을 구분한다.
--
-- 왜 필요한가: 정기 거래처 현장에서 직원이 '금일 특이사항'을 올리면 claims에 쌓인다.
-- 그런데 지금은 누가 넣었는지 남는 칸이 없어서, 사장님이 접수한 고객 클레임과
-- 현장이 스스로 발견해 처리한 건이 섞인다. 둘은 성격이 달라(하나는 컴플레인,
-- 하나는 선제 조치) 나중에 월간 보고서에서 갈라 보여줘야 한다.
--
-- ⚠️ 기존 행은 전부 NULL로 남는다 = 사장님이 등록한 건. 의도된 값이니 채우지 말 것.

alter table public.claims
  add column if not exists created_by_worker_id uuid references public.workers(id) on delete set null;

-- 현장 직원이 오늘 올린 건을 예약 단위로 빠르게 찾기 위한 인덱스
create index if not exists claims_booking_worker_idx
  on public.claims (booking_id, created_by_worker_id);

-- claims는 이미 RLS가 켜져 있다(20260619040000_create_claims.sql).
-- 컬럼 추가는 RLS 상태를 바꾸지 않지만, 검사 스크립트가 파일 단위로 보므로 명시해 둔다.
alter table public.claims enable row level security;
