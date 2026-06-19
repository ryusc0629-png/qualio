-- 본사 내부 지표 월별 스냅샷 — NRR(순매출유지율)·코호트 리텐션 계산 기반
--
-- 왜 필요한가:
--   NRR/코호트는 "특정 시점의 MRR"이 시간에 따라 어떻게 변했는지를 봐야 계산된다.
--   현재 운영 테이블만으로는 과거 시점 MRR을 알 수 없으므로, 월별 스냅샷을 적재한다.
--   daily-maintenance 크론이 매일 "현재 월(period)" 행을 upsert → 지난 달은 자연히 고정된다.
--
-- 접근 권한: 본사 관리자 전용. service_role(RLS 우회)로만 접근하고,
--   RLS를 켜되 정책을 두지 않아 anon/authenticated는 읽지 못하게 잠근다.

-- 1) 플랫폼 집계 스냅샷 (월별 1행) — MRR 추이 차트 등에 사용
create table if not exists metrics_snapshots (
  period            text primary key,                 -- 'YYYY-MM' (KST 기준 월)
  total_businesses  integer not null default 0,
  paying_businesses integer not null default 0,
  mrr               bigint  not null default 0,        -- 월 반복 매출(원)
  contract_mrr      bigint  not null default 0,        -- 정기계약 월 환산 매출(원)
  realized_gmv      bigint  not null default 0,        -- 완료 예약 누적 거래액(원)
  active_contracts  integer not null default 0,
  total_leads       integer not null default 0,
  data              jsonb   not null default '{}'::jsonb,  -- 전체 지표 페이로드 보관
  captured_at       timestamptz not null default now()
);

-- 2) 업체별 월 MRR 스냅샷 — NRR/코호트 계산용
create table if not exists business_mrr_snapshots (
  period      text not null,                           -- 'YYYY-MM'
  business_id uuid not null references businesses(id) on delete cascade,
  plan        text not null default 'beta',
  status      text not null default '',
  mrr         bigint not null default 0,               -- 해당 업체의 그 시점 MRR(원)
  captured_at timestamptz not null default now(),
  primary key (period, business_id)
);

create index if not exists idx_business_mrr_snapshots_period on business_mrr_snapshots(period);

alter table metrics_snapshots enable row level security;
alter table business_mrr_snapshots enable row level security;
