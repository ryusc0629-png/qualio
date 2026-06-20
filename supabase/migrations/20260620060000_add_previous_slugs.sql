-- businesses: keep old slugs so changing the public page address doesn't break
-- existing/shared/indexed links (old slug 301-redirects to the current one).
alter table public.businesses
  add column if not exists previous_slugs text[] not null default '{}';

-- lookup old slug → business (for redirect)
create index if not exists businesses_previous_slugs_idx
  on public.businesses using gin (previous_slugs);
