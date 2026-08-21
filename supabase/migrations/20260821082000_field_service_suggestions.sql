-- 현장에서 올리는 '다음에 제안할 서비스'를 기존 재방문 대기열에 함께 담는다.
--
-- 왜 새 테이블을 안 만드나:
--   대기열이 하는 일이 같다 — "예전 고객에게 언젠가 다시 연락한다".
--   표를 새로 파면 사장님이 볼 화면이 둘로 갈라지고, 같은 고객에게 두 번 연락하게 된다.
--   그래서 컬럼만 늘려 한 표·한 화면으로 유지한다.
--
-- 흐름: 현장 직원이 보고서에서 고름(pending) → 대표가 승인(scheduled)
--       → due_at이 되면 크론이 광고 문자 발송(sent) 또는 발송 자격이 없으면 대표에게 알림.

alter table public.reengagement_dispatches
  add column if not exists source       text not null default 'auto_90d', -- auto_90d | field
  add column if not exists due_at       timestamptz,                      -- 이때 연락한다 (null = 지금)
  add column if not exists service_name text,                             -- 제안할 서비스
  add column if not exists reason       text,                             -- 현장이 적은 근거
  add column if not exists worker_id    uuid references public.workers(id) on delete set null,
  add column if not exists report_id    uuid references public.reports(id) on delete cascade,
  add column if not exists approved_at  timestamptz,
  add column if not exists fail_reason  text;

-- status: pending(검토 대기) / scheduled(승인·발송 예약) / sent / skipped / failed
alter table public.reengagement_dispatches
  drop constraint if exists reengagement_dispatches_status_check;
alter table public.reengagement_dispatches
  add constraint reengagement_dispatches_status_check
  check (status in ('pending', 'scheduled', 'sent', 'skipped', 'failed'));

-- 기존 유니크(고객당 1건)는 90일 자동 대기열에만 적용한다.
-- 현장 제안은 방문마다 생길 수 있어 이 제약에 걸리면 아예 저장이 안 된다.
alter table public.reengagement_dispatches
  drop constraint if exists reengagement_dispatches_business_id_customer_phone_key;
create unique index if not exists reengagement_dispatches_auto_customer_uniq
  on public.reengagement_dispatches (business_id, customer_phone)
  where source = 'auto_90d';

-- 현장 제안 중복 방지 — 같은 보고서에서 같은 서비스는 한 건만(저장 반복해도 안 쌓인다)
create unique index if not exists reengagement_dispatches_report_service_uniq
  on public.reengagement_dispatches (report_id, service_name)
  where report_id is not null;

create index if not exists idx_red_due
  on public.reengagement_dispatches (status, due_at);

-- 광고성 문자(정보통신망법 제50조)의 동의·거부 기록.
--
-- 왜 고객 표(customers)가 아니라 전화번호 기준의 별도 표인가:
--   동의는 견적 폼에서 받는데 그 시점엔 고객 행이 아직 없고,
--   수신거부는 우리 고객 목록에 없는 사람이 눌러도 반드시 지켜져야 한다.
--   둘 다 '이 번호로 광고를 보내도 되나'를 묻는 것이라 번호를 열쇠로 둔다.
create table if not exists public.marketing_consents (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone       text not null,
  source      text not null default 'quote_form',
  created_at  timestamptz not null default now(),
  unique (business_id, phone)
);
alter table public.marketing_consents enable row level security;

create table if not exists public.marketing_optouts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone       text not null,
  created_at  timestamptz not null default now(),
  unique (business_id, phone)
);
alter table public.marketing_optouts enable row level security;
