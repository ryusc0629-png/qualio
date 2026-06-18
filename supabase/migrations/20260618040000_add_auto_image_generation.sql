-- 포스트 자동 발행 시 AI 이미지 자동 생성 여부 토글
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS auto_image_generation boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN businesses.auto_image_generation IS
  'true: 자동 발행 시 FAL AI 이미지 3장 함께 생성 / false: 텍스트만 발행 (사장님이 직접 사진 추가)';
