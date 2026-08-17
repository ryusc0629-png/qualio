-- 오류 신고 처리 기록 — 본사에서 신고를 확인하고 닫을 수 있게 한다.
-- admin_note  : 어떻게 처리했는지(원인·조치). 다음에 같은 신고가 왔을 때 근거가 된다.
-- resolved_at : 해결로 옮긴 시각. 되돌리면 지운다.
alter table public.bug_reports add column if not exists admin_note text;
alter table public.bug_reports add column if not exists resolved_at timestamptz;

comment on column public.bug_reports.admin_note is '본사 처리 메모 — 원인과 조치 내용';
comment on column public.bug_reports.resolved_at is '해결 처리 시각 — 되돌리면 null';
