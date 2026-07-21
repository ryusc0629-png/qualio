-- GEO 노출 측정 — 업체별 질문 세트 + 주기적 측정 결과(노출 점유율 추세)
-- Perplexity 검색으로 "소비자 질문에 우리 업체가 노출되나"를 측정해 대시보드에 추세로 표시.

-- 업체별 질문 매트릭스(지역×서비스×고민) — 월 단위로 재생성/캐시
create table if not exists geo_questions (
  id            uuid        primary key default gen_random_uuid(),
  business_id   uuid        not null references businesses(id) on delete cascade,
  question      text        not null,
  active        boolean     not null default true,
  created_month text,                 -- 'YYYY-MM' — 월 단위 재생성 캐시 키
  created_at    timestamptz not null default now()
);

create index if not exists geo_questions_business_idx
  on geo_questions(business_id) where active;

-- 측정 실행 1회 = 1행. 질문별 상세는 detail(jsonb)에, 요약(cited/total/share)은 컬럼에.
create table if not exists geo_checks (
  id          uuid        primary key default gen_random_uuid(),
  business_id uuid        not null references businesses(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  engine      text        not null default 'perplexity',
  total       int         not null,
  cited       int         not null,
  share_pct   int         not null,
  detail      jsonb       not null default '[]'::jsonb  -- [{query, mentioned, topDomains}]
);

create index if not exists geo_checks_business_idx
  on geo_checks(business_id, checked_at desc);
