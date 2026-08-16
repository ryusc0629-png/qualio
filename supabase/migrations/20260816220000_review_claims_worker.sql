-- 후기를 담당 기사에게 귀속시킨다.
--
-- 왜 필요한가: 고객에게 대가를 주는 방식(기프티콘·현금)은 네이버 플레이스의
-- 대가성 리뷰 금지에 걸리고, 지급도 매번 사람이 해야 해서 오래 못 간다.
-- 서비스타이탄은 반대로 한다 — 리뷰를 현장 기사에게 귀속시켜 성과급으로 준다.
-- 고객에게 아무것도 주지 않으니 정책과 무관하고, 실제로 현장에서 부탁하는
-- 사람에게 보상이 가서 효과가 크다. 도급사도 정산 때 가산하면 된다.
alter table public.review_claims
  add column if not exists worker_id uuid references public.workers(id) on delete set null;

-- 기사별·기간별 집계(급여 화면, 마케팅 화면)에서 매번 훑지 않도록
create index if not exists review_claims_worker_claimed_idx
  on public.review_claims (business_id, worker_id, claimed_at);

comment on column public.review_claims.worker_id is
  '이 후기 요청이 나간 현장의 담당 기사. 발송 시점의 bookings.worker_id를 복사해 둔다(이후 배정이 바뀌어도 성과는 그대로 남아야 하므로).';
