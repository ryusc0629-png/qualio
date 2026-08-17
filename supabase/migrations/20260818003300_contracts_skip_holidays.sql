-- 정기계약: 공휴일에 방문할지 말지를 계약에 붙인다.
-- 기본값 true = 공휴일엔 안 감(대부분의 사무실·상가가 문을 닫으므로).
-- 이 값이 true면 자동 방문 생성(lib/recurring/generate.ts)이 공휴일을 건너뛴다.
alter table public.contracts
  add column if not exists skip_holidays boolean not null default true;

comment on column public.contracts.skip_holidays is '공휴일엔 방문하지 않음(true) — 자동 일정 생성에서 공휴일 제외';
