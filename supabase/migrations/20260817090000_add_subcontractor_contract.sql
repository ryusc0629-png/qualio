-- 도급사 표준 계약서 — 도급사(workers.type='contractor') 행에 계약 내용과 체결 시각을 저장한다.
-- contract_data      : 사장님이 채운 빈칸(갑·을 정보, 정산 방식·금액, 특약 등) JSONB
-- contract_signed_at : 날인본을 회수해 '계약 완료'로 표시한 시각. 값이 있으면 '계약 완료' 배지
alter table public.workers add column if not exists contract_data jsonb;
alter table public.workers add column if not exists contract_signed_at timestamptz;

comment on column public.workers.contract_data is '도급 계약서 입력값(JSONB) — 갑·을 정보, 정산 방식·금액, 특약';
comment on column public.workers.contract_signed_at is '도급 계약 체결(날인본 회수) 시각 — 값이 있으면 계약 완료';
