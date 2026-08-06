-- 업체별 '소개서/제안서' 설정 저장.
-- 소개서에 들어갈 대부분(업체명·로고·브랜드색·강점·시공사례·경력 등)은 기존 businesses 컬럼을
-- 그대로 재사용하고, 여기엔 '소개서 전용' 선택/입력값만 담는다.
--   template   : 선택한 소개서 템플릿 id (예: 'company')
--   category   : 대상 공간 카테고리 (예: 'general' | 'hospital' | 'office' | 'store' | 'interior')
--   theme      : 디자인 테마 id (예: 'emerald' | 'gold' | 'slate')
--   headline   : 표지 강조 문구(태그라인). 비면 업체 description/hero_title로 대체
--   stats      : 신뢰 통계 카드 [{ value, unit, label }] (예: 3년/12팀/…) — 최대 3개
--   sections   : 노출할 섹션 토글 { investment, principles, refund, process, trust, categorySpecial }
alter table businesses add column if not exists proposal_settings jsonb;
