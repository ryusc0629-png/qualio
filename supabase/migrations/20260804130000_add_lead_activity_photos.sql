-- 미팅 녹음 정리 시, 현장에서 페이지 안 카메라로 찍은 사진 URL 목록을 상담 기록에 함께 저장한다.
-- (녹음 중 네이티브 카메라 앱으로 나가면 마이크가 끊기므로, 페이지 안 카메라로 찍어 여기에 붙인다)
alter table public.lead_activities
  add column if not exists photos jsonb not null default '[]'::jsonb;

comment on column public.lead_activities.photos is '상담 기록에 첨부된 현장 사진 공개 URL 배열(post-images 버킷)';
