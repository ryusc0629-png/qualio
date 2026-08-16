-- 가격 벤치마크 스냅샷
--
-- 객단가(예약 건당 평균 금액)가 높은 업체들이 실제로 쓰는 3단계 플랜 구성을
-- 매일 집계해 한 행으로 저장한다. 서비스 항목 편집 화면의 "가격 가이드"가
-- 이 값을 읽어 "객단가 높은 사장님들은 평균 +N%" 문구와 추천 구성을 보여준다.
--
-- ★ 표본이 적으면 수치를 지어내지 않는다 — 집계 함수가 기준 미달이면
--   uplift/items 를 null·빈값으로 저장하고 화면에서는 문구 자체를 숨긴다.

-- ★ 이 마이그레이션은 이미 운영 DB에 적용돼 있다(MCP apply_migration, 기록된 버전 20260816114213).
--   파일명 타임스탬프(KST)와 기록된 버전(UTC)이 달라 supabase db push 가 '미적용'으로 보고
--   다시 실행할 수 있으므로, 다시 돌아도 아무 일 없도록 if not exists 로 둔다.
create table if not exists public.pricing_benchmarks (
  id uuid primary key default gen_random_uuid(),
  computed_at timestamptz not null default now(),

  -- 집계에 들어간 업체 수 (객단가·플랜가격이 모두 있는 업체)
  sample_biz integer not null default 0,
  -- 그중 객단가 상위 그룹 업체 수
  top_biz integer not null default 0,

  -- 상위 그룹의 기본가 대비 인상률 중앙값(%) — 표본 미달이면 null
  top_better_uplift_pct numeric,
  top_best_uplift_pct numeric,
  -- 전체 표본 중앙값(%) — 상위 그룹과 비교해 보여주기 위함
  all_better_uplift_pct numeric,

  -- 평균 객단가(원) — 상위 그룹 / 전체
  top_arpu integer,
  all_arpu integer,

  -- 상위 그룹이 많이 쓰는 플랜 항목 { good: string[], better: string[], best: string[] }
  top_items jsonb not null default '{}'::jsonb
);

alter table public.pricing_benchmarks enable row level security;

-- 최신 스냅샷 1건만 읽으므로 시간 역순 인덱스
create index if not exists pricing_benchmarks_computed_at_idx
  on public.pricing_benchmarks (computed_at desc);
