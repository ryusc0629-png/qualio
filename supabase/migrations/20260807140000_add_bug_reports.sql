-- 베타 오류 신고 게시판
-- 사장님(사용자)이 앱 어디서든 "오류 신고" 버튼으로 남긴 내용을 모아
-- 본사(관리자)가 확인·분류·수정하기 위한 테이블.
-- 로그인 사용자의 업체/사용자 맥락과 어느 화면에서 신고했는지(page_url)를 함께 저장한다.
create table if not exists public.bug_reports (
  id            uuid primary key default gen_random_uuid(),
  -- 신고한 업체·사용자 (로그인 상태면 채워짐, 아니면 null)
  business_id   uuid references public.businesses(id) on delete set null,
  user_id       uuid,
  -- 관리자 목록에서 바로 알아보기 위한 표시용 이름(업체명 또는 사용자명)
  reporter_name text,
  -- 신고 본문 (사장님이 겪은 문제를 자기 말로 적음)
  message       text not null,
  -- 신고 당시 화면 경로 (예: /dashboard/quotes) — 재현에 필요
  page_url      text,
  -- 브라우저/기기 정보 — 기기별 버그 파악용
  user_agent    text,
  -- 처리 상태: new(신규) | reviewing(확인 중) | resolved(해결됨)
  status        text not null default 'new',
  created_at    timestamptz not null default now()
);

-- 최신순 조회 최적화
create index if not exists idx_bug_reports_created on public.bug_reports (created_at desc);
-- 상태별 필터 최적화
create index if not exists idx_bug_reports_status on public.bug_reports (status);
