-- 대표 인사말 섹션 — 얼굴 사진(자체 저장) + 이름/직함 + 인사말 + 인사말 영상(유튜브 링크)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS owner_photo_url text,
  ADD COLUMN IF NOT EXISTS owner_name      text,
  ADD COLUMN IF NOT EXISTS owner_greeting  text,
  ADD COLUMN IF NOT EXISTS owner_video_url text;
