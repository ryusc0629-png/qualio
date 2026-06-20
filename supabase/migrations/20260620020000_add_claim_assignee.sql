-- claims: who is responsible for handling the complaint
alter table public.claims
  add column if not exists assigned_worker_id uuid references public.workers(id) on delete set null;
