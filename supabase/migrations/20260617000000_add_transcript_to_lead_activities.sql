-- 미팅 녹음 정리 기능: 상담 기록에 받아쓴 원문(transcript) 보관용 컬럼 추가
-- type 컬럼은 CHECK 제약이 없어 'meeting' 값을 별도 변경 없이 사용 가능
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS transcript TEXT;
