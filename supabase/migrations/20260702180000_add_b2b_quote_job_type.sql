-- B2B 견적: 작업 유형(정기 계약 / 일회성 작업) 구분
-- 청소 주기(frequency)는 정기 계약에만 해당한다. 인테리어 후 준공청소·외벽청소 등
-- 일회성 B2B 작업도 많으므로, 주기 전제를 벗기고 일회성 견적도 지원한다.
-- (Jobber/HCP/ServiceTitan의 one-off job vs recurring job 구분 벤치마킹)
--
-- 기존 견적은 모두 주기 기반으로 작성됐으므로 기본값 recurring.

ALTER TABLE b2b_quotes
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'recurring'
    CHECK (job_type IN ('recurring', 'one_off'));
