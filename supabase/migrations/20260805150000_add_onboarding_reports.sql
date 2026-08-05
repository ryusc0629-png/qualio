-- 초도 진단·작업 보고 리포트 — 정기청소 첫 정착기에 현황 진단·작업 시방·결과 보고를
-- 한 문서로 정리해 거래처에 직접 전달(사장님이 방문·통화로, 자동 발송 아님).
-- 계약 1건당 1개(초도는 1회성)를 원칙으로 하되, 강제 제약은 서버 액션에서 관리한다.

create table if not exists onboarding_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contract_id uuid references contracts(id) on delete set null,
  customer_id uuid not null references customers(id) on delete cascade,
  status text not null default 'draft',        -- draft | shared
  before_note text,                            -- 현황 요약(도입 문구)
  spec_note text,                              -- 작업 시방(이렇게 작업하겠습니다)
  management_note text,                        -- 관리 멘트(공감·정직 마무리)
  items jsonb not null default '[]'::jsonb,    -- 문제 항목 배열 (구역·문제·해결구분·before/after·결과·다음액션)
  public_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  shared_at timestamptz
);

create index if not exists onboarding_reports_business_idx on onboarding_reports (business_id);
create index if not exists onboarding_reports_contract_idx on onboarding_reports (contract_id);
create unique index if not exists onboarding_reports_public_token_idx on onboarding_reports (public_token);
