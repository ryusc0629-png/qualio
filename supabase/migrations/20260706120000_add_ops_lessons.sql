-- OPS 영상 교육 레슨 테이블
-- 영상 자체는 Vimeo에 올리고, 여기엔 메타데이터(제목·순서·무료여부·Vimeo ID)만 저장한다.
-- 게이팅은 앱단에서 처리: is_free=true 는 누구나 시청, 나머지는 로그인(=퀄리오 계정) 필요.
-- 즉 "시청 계정 = 퀄리오 계정" 통합 → 무료 강의 시청이 곧 SaaS 가입으로 이어진다.
CREATE TABLE IF NOT EXISTS public.ops_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                              -- 강의 제목
  description TEXT,                                 -- 설명(선택)
  vimeo_id TEXT NOT NULL,                           -- Vimeo 영상 ID (예: 76979871)
  sort_order INTEGER NOT NULL DEFAULT 0,            -- 강의 순서
  is_free BOOLEAN NOT NULL DEFAULT false,           -- 무료 공개(맛보기) 여부 — true면 비로그인도 시청
  duration_label TEXT,                             -- 표시용 길이 (예: "10분")
  thumbnail_url TEXT,                              -- 커스텀 썸네일(선택)
  published BOOLEAN NOT NULL DEFAULT false,          -- 노출 여부(초안/공개)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_lessons_order
  ON public.ops_lessons(sort_order);

-- RLS 활성화 — 모든 접근은 서버(service_role)로만. 브라우저 직접 조회 차단(정책 없음 = 기본 거부).
ALTER TABLE public.ops_lessons ENABLE ROW LEVEL SECURITY;
