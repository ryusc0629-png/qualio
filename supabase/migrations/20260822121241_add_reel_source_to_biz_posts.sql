-- 시공 사례(biz_posts)도 홍보 영상의 재료가 될 수 있게 한다.
--
-- 왜: 지금은 예약 → 작업보고서 → 릴스로만 이어져서, 작업보고서가 없는 업체(릴스 기능만
-- 쓰거나 예전에 찍어둔 영상을 쓰려는 경우)는 릴스를 아예 못 만든다. reports.booking_id가
-- NOT NULL이라 가짜 예약을 만들지 않고서는 길이 없었고, 가짜 예약은 매출·건수 통계를 오염시킨다.
-- 시공 사례엔 대본 재료(제목·본문)와 전·후 사진이 이미 있고 reel_url 칸도 이미 있었다.
-- 없는 건 영상 클립뿐이라 그것만 채우면 같은 파이프라인을 그대로 쓸 수 있다.
--
-- ⚠️새 테이블이 아니라 기존 테이블에 칸만 더하는 것이므로 RLS는 이미 걸려 있다.
alter table public.biz_posts
  add column if not exists work_clip_urls text[],
  add column if not exists work_clip_durations double precision[],
  add column if not exists reel_status text not null default 'idle',
  add column if not exists reel_render_id text,
  add column if not exists reel_queued_at timestamptz,
  add column if not exists reel_error text;

-- 웹훅이 완성 통보를 받으면 render id로 어느 줄인지 찾아야 한다(reports와 동일)
create index if not exists biz_posts_reel_render_id_idx
  on public.biz_posts (reel_render_id) where reel_render_id is not null;

-- 크론이 대기열을 훑을 때 쓴다
create index if not exists biz_posts_reel_status_idx
  on public.biz_posts (reel_status) where reel_status <> 'idle';
