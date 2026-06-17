-- 리뷰 수집 채널 확장: 당근/카카오 URL + 활성 채널 선택
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS danggeun_review_url text,
  ADD COLUMN IF NOT EXISTS kakao_place_url text,
  ADD COLUMN IF NOT EXISTS active_review_platform text NOT NULL DEFAULT 'naver';

COMMENT ON COLUMN businesses.active_review_platform IS '현재 리뷰 수집 대상 플랫폼: naver, google, danggeun, kakao';
COMMENT ON COLUMN businesses.danggeun_review_url IS '당근마켓 비즈프로필 후기 URL';
COMMENT ON COLUMN businesses.kakao_place_url IS '카카오맵 후기 URL';
