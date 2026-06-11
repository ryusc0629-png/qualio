-- quotes 테이블에 AI 견적 피치 캐시 컬럼 추가
-- 견적 랜딩 페이지에서 AI 생성 콘텐츠를 캐시하여 재생성 방지
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS ai_pitch jsonb;
