-- b2b_quotes에 견적서 이름(라벨) 추가 — 한 거래처에 여러 장일 때 목록에서 구분용
-- (예: 오텍 경주 공장에 '사무동 정기청소' / '공장동 대청소' / '바닥 왁스')
ALTER TABLE b2b_quotes ADD COLUMN IF NOT EXISTS title TEXT;
COMMENT ON COLUMN b2b_quotes.title IS '견적서 이름(사장님이 붙이는 라벨, 목록 구분용). 없으면 현장명·첫 서비스명·견적번호로 표시';
