-- push_subscriptions: support field worker / contractor devices, not just the owner.
-- owner subs have user_id set + worker_id null; worker subs have worker_id set + user_id null.
alter table public.push_subscriptions
  add column if not exists worker_id uuid references public.workers(id) on delete cascade;

create index if not exists push_subscriptions_worker_id_idx
  on public.push_subscriptions (worker_id);
