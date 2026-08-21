-- 견적 자동 채우기 기록
-- 자동으로 채운 값(extracted)과 사장님이 최종 저장한 값(saved)을 한 행에 남긴다.
-- 이 둘의 차이가 "무엇을 매번 다시 고치고 계신가"를 알려주는 유일한 근거다.
-- (지금까지는 아무 기록이 없어 감으로만 프롬프트를 고칠 수 있었다)
create table if not exists public.quote_autofill_logs (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  lead_id       uuid,
  -- 저장까지 이어졌으면 그 견적서 id (자동 채우기만 하고 안 만들면 null)
  quote_id      uuid,
  -- 자동 채우기가 뽑아낸 값
  extracted     jsonb not null,
  -- 사장님이 최종 저장한 값 (저장 시점에 채워짐)
  saved         jsonb,
  -- 분석에 넣은 상담 기록 길이 — 원문이 짧아서 못 채운 건지 구분하려고 남긴다
  source_chars  integer,
  created_at    timestamptz not null default now(),
  saved_at      timestamptz
);

alter table public.quote_autofill_logs enable row level security;

create index if not exists idx_quote_autofill_logs_business
  on public.quote_autofill_logs (business_id, created_at desc);
