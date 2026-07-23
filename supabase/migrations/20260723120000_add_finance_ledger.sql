-- 매출·지출 장부(손익 관리) — 사장님이 매일 매출/매입을 기록하고
-- 고정비·손익분기점·순이익을 한눈에 보는 재무 대시보드용 테이블 2종

-- 1) 일별 거래 기록 — 매출(revenue) / 매입·지출(expense) 한 건 = 1행
create table if not exists finance_entries (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  entry_date  date        not null,                    -- 거래 발생일(KST 기준 날짜)
  type        text        not null,                    -- 'revenue' | 'expense'
  category    text        not null default '기타',      -- 분류(정기청소/인건비/자재 등)
  amount      integer     not null,                    -- 금액(원, 양수)
  memo        text,                                     -- 메모(선택)
  created_at  timestamptz not null default now()
);

create index if not exists finance_entries_business_date_idx
  on finance_entries(business_id, entry_date desc);

-- 2) 월 고정비 — 매달 무조건 나가는 돈(임대료·차량·보험·급여·구독료 등)
--    손익분기점 계산의 기준. 일별 기록이 아니라 '월 단위 상시 항목'.
create table if not exists fixed_costs (
  id             uuid        primary key default gen_random_uuid(),
  business_id    uuid        not null references businesses(id) on delete cascade,
  name           text        not null,                 -- 항목명(예: 사무실 임대료)
  monthly_amount integer     not null,                 -- 월 금액(원)
  active         boolean     not null default true,    -- 끄면 손익분기점 계산에서 제외
  created_at     timestamptz not null default now()
);

create index if not exists fixed_costs_business_idx
  on fixed_costs(business_id) where active;

-- RLS 활성화 — 정책 없음 → service_role(서버 액션)만 접근. 프로젝트 컨벤션 동일.
alter table finance_entries enable row level security;
alter table fixed_costs enable row level security;
