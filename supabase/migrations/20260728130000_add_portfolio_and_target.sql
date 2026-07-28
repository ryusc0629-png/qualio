-- 시공 사례 직접 등록(작업 보고와 별개) + 주 고객 유형(B2B/B2C) 카피 분기
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS portfolio        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{before, after}]
  ADD COLUMN IF NOT EXISTS target_customer  text  NOT NULL DEFAULT 'b2c';        -- 'b2b'(상업공간) | 'b2c'(가정)

COMMENT ON COLUMN businesses.portfolio       IS '시공 사례 비포·애프터 [{before, after}] — 작업 보고와 별개로 직접 등록';
COMMENT ON COLUMN businesses.target_customer IS '주 고객 유형 b2b(상업공간) | b2c(가정) — 홈페이지 카피 분기';
