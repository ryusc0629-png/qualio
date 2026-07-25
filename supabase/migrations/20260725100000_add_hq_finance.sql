-- 본사(퀄리오 회사) 재무 관리 — 매각 대비 손익 데이터
--
-- 왜 필요한가:
--   /admin 지표는 매출(MRR)만 본다. 회사가 실제로 버는지(순이익)를 알려면 비용(구독·지출)을
--   함께 담아야 한다. 매각 실사의 핵심인 '매출총이익률'을 뽑기 위해, 각 비용을
--   매출원가(COGS)/판관비(OpEx)로 분류(finance-categories.ts)해 저장한다.
--
-- 매출은 새로 담지 않고 기존 subscriptions(고객사 구독)에서 MRR로 자동 계산한다.
-- 접근: 관리자(/admin)만 사용. service_role 전용, RLS 잠금.

-- 정기결제(고정비) — AI·소프트웨어·광고 등 반복 비용
create table if not exists hq_subscriptions (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,                    -- 예: Claude API, Vercel
  category          text        not null,                    -- finance-categories.ts id (COGS/OpEx 매핑)
  amount            numeric     not null,                    -- 원 통화 금액
  currency          text        not null default 'KRW',      -- 'KRW' | 'USD'
  cycle             text        not null default 'monthly',  -- 'monthly' | 'yearly'
  next_billing_date date,                                    -- 다음 결제일(임박 표시용)
  active            boolean     not null default true,       -- 해지 시 false
  memo              text,
  created_at        timestamptz not null default now()
);

-- 일회성/실지출 — 세금·수수료·단발 구매 등
create table if not exists hq_expenses (
  id          uuid        primary key default gen_random_uuid(),
  spent_on    date        not null default current_date,
  name        text        not null,
  category    text        not null,
  amount      numeric     not null,                          -- 원 통화 금액
  currency    text        not null default 'KRW',
  amount_krw  numeric     not null,                          -- 입력 시점 원화 환산(과거 기록 정확도 보존)
  memo        text,
  created_at  timestamptz not null default now()
);

-- 본사 재무 설정(단일 행) — 환율·현금잔고
create table if not exists hq_settings (
  id            integer     primary key default 1,
  usd_krw_rate  numeric     not null default 1400,           -- USD→KRW 환산율(수동 설정)
  cash_balance  numeric,                                     -- 현금 잔고(런웨이용, Phase 2)
  updated_at    timestamptz not null default now(),
  constraint hq_settings_single_row check (id = 1)
);

insert into hq_settings (id) values (1) on conflict (id) do nothing;

create index if not exists idx_hq_subscriptions_active on hq_subscriptions(active);
create index if not exists idx_hq_expenses_spent_on    on hq_expenses(spent_on desc);

alter table hq_subscriptions enable row level security;
alter table hq_expenses      enable row level security;
alter table hq_settings      enable row level security;
