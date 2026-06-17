-- 릴스 영상 제작 관련 컬럼 추가
-- work_clip_urls: 현장 직원이 촬영한 작업 중 영상 클립 URL 목록
alter table reports add column if not exists work_clip_urls text[] default '{}';
-- reel_status: 릴스 편집 상태 (idle / processing / done / failed)
alter table reports add column if not exists reel_status text not null default 'idle';
-- reel_url: Creatomate가 완성한 릴스 영상 URL
alter table reports add column if not exists reel_url text;
-- reel_render_id: Creatomate 렌더 ID (webhook 응답 매칭용)
alter table reports add column if not exists reel_render_id text;
