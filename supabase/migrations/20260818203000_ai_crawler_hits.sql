-- AI 크롤러 방문 기록 — GPTBot·OAI-SearchBot·PerplexityBot 같은 AI 검색 봇이
-- 우리 공개 페이지를 긁어간 횟수를 업체·봇·날짜 단위로 센다.
--
-- 왜 필요한가: AI 검색에 인용되려면 먼저 크롤러가 우리 글을 읽어가야 한다.
-- 노출률이 아직 0%여도 크롤러 방문은 계속 늘어나므로, 사장님이 "되고 있다"를
-- 눈으로 확인할 수 있는 유일한 선행 지표다.
--
-- 행 하나에 하루치를 누적한다(요청마다 한 줄씩 쌓으면 봇 트래픽에 테이블이 금방 커진다).
create table if not exists public.ai_crawler_hits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  bot text not null,                       -- 'chatgpt' | 'perplexity' | 'claude' | 'google_ai' | 'bing_ai' | 'other'
  hit_date date not null,                  -- KST 기준 날짜(앱에서 계산해 넘긴다)
  hits integer not null default 1,
  created_at timestamptz not null default now(),
  unique (business_id, bot, hit_date)
);

alter table public.ai_crawler_hits enable row level security;

create index if not exists ai_crawler_hits_biz_date_idx
  on public.ai_crawler_hits (business_id, hit_date desc);

-- 하루치 누적 — 같은 (업체·봇·날짜)면 hits를 1 올린다.
-- 앱에서 select→update로 처리하면 동시 요청에 카운트가 새므로 DB에서 원자적으로 처리한다.
create or replace function public.record_ai_crawler_hit(
  p_business_id uuid,
  p_bot text,
  p_date date
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_crawler_hits (business_id, bot, hit_date, hits)
  values (p_business_id, p_bot, p_date, 1)
  on conflict (business_id, bot, hit_date)
  do update set hits = public.ai_crawler_hits.hits + 1;
$$;
