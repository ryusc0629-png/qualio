-- 계약 중인 거래처(customers)에도 견적서/시방서를 만들 수 있게 확장
-- 기존엔 영업 리드(leads)에만 연결됐으나, 이미 계약한 거래처의 재계약·추가 견적을 위해 customer_id도 지원

-- 리드 없이 고객만으로도 견적서 생성 가능하도록 lead_id 필수 해제
ALTER TABLE b2b_quotes ALTER COLUMN lead_id DROP NOT NULL;

-- 고객 연결 컬럼 추가 (리드 또는 고객 중 하나에 연결)
ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_b2b_quotes_customer_id ON b2b_quotes(customer_id);
