-- 도급 정산 자동 기입 — 장부 한 줄이 '사장님이 손으로 넣은 것'인지
-- '도급 정산에서 자동으로 만들어진 것'인지 구분한다.
--
-- source     : 'manual'(사장님 직접 입력, 기본값) | 'subcontract'(도급 정산 확정)
-- source_key : 자동 기입분의 고유 키. 같은 도급사·같은 달을 여러 번 확정해도
--              줄이 늘어나지 않고 금액만 갱신되도록 (business_id, source_key)를 유니크로 잠근다.
--              예: 'subcontract:{workerId}:2026-08:pay'
alter table public.finance_entries
  add column if not exists source text not null default 'manual';

alter table public.finance_entries
  add column if not exists source_key text;

-- 자동 기입분 중복 차단. source_key가 null인 수동 입력 줄은 제약을 받지 않는다.
create unique index if not exists finance_entries_source_key_uniq
  on public.finance_entries(business_id, source_key)
  where source_key is not null;

comment on column public.finance_entries.source is
  '기록 출처 — manual(사장님 직접) | subcontract(도급 정산 자동 기입)';
comment on column public.finance_entries.source_key is
  '자동 기입분 고유 키(예: subcontract:{workerId}:2026-08:pay) — 재확정 시 새 줄이 아니라 덮어쓰기';
