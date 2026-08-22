-- 시공 사례로 만든 홍보 영상도 요금이 붙게 한다.
--
-- 🔴버그: reel_charges.report_id에 reports FK가 걸려 있어서, 시공 사례(biz_posts)로 만든
-- 영상의 id를 넣으면 FK 위반으로 insert가 실패했다. 그 실패는 catch에서 로그만 남기고
-- 넘어가도록 돼 있어(영상 제작을 막지 않으려고) **아무도 모르게 요금이 안 붙었다**.
-- 즉 2026-08-22에 만든 '갖고 있는 영상으로 만들기'는 무료 5편을 다 써도 계속 공짜였다.
alter table public.reel_charges
  alter column report_id drop not null,
  add column if not exists post_id uuid references public.biz_posts(id) on delete set null;

-- 사례당 한 번만 — 다시 만들어도 두 번 물리지 않는다(report_id와 같은 규칙)
create unique index if not exists reel_charges_post_id_key
  on public.reel_charges (post_id) where post_id is not null;

-- 둘 중 정확히 하나만 채워져 있어야 한다. 둘 다 비면 어디서 온 요금인지 알 수 없다.
-- ⚠️on delete set null로 둘 다 null이 될 수 있으므로 not valid로 붙여 기존·향후 삭제를 막지 않는다.
alter table public.reel_charges
  drop constraint if exists reel_charges_one_source;
alter table public.reel_charges
  add constraint reel_charges_one_source
  check (report_id is not null or post_id is not null) not valid;
