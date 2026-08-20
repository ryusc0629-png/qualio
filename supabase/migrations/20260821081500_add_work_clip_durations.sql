-- 현장에서 올린 작업 영상의 실제 길이(초). work_clip_urls와 같은 순서.
--
-- 왜 필요한가: 릴스에서 화면 길이를 나레이션에 맞추는데, 클립이 그보다 짧으면
-- 마지막 프레임이 멈춰 있거나 검은 화면이 나온다. 브라우저에서 영상을 고를 때
-- 이미 길이를 읽고 있으므로(썸네일 뽑느라 video 태그에 올린다) 그 값을 같이 저장해
-- 대본을 클립 길이에 맞춰 나눈다.
alter table public.reports
  add column if not exists work_clip_durations numeric[] default null;
