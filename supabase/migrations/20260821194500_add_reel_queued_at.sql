-- 홍보 영상이 대기열에 들어간 시각.
--
-- 왜 필요한가: 현장 직원이 '만들기' 버튼을 누르던 것을 없애고, 보고서를 보내거나
-- 작업을 끝내면 자동으로 대기열에 들어가게 했다. 실제 제작은 크론이 하는데,
-- 오래된 것부터 순서대로 처리하려면 언제 들어왔는지가 있어야 한다.
alter table public.reports
  add column if not exists reel_queued_at timestamptz default null;

-- 크론이 대기열만 훑을 때 쓰는 인덱스
create index if not exists reports_reel_queue_idx
  on public.reports (reel_status, reel_queued_at)
  where reel_status = 'queued';
