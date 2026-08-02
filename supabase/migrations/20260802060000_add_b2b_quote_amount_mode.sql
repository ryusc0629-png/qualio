-- 견적 금액 입력 방식(항목별 계산 itemized / 총액 직접 lump)을 저장한다.
-- 재열람 시 방식이 바뀌거나(수량 1 추정 오류) 미리보기에서 횟수 열이 사라지는 문제를 막기 위함.
alter table b2b_quotes add column if not exists amount_mode text;

comment on column b2b_quotes.amount_mode is '금액 입력 방식: itemized(항목별 계산) | lump(총액 직접). null=옛 견적(수량으로 추정)';
