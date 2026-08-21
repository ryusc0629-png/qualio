-- 홍보 영상 제작이 실패한 이유.
--
-- 왜 필요한가: 실패하면 화면에 "못 만들었어요"만 뜨고 원인을 알 방법이 없었다.
-- 편집 서비스가 웹훅으로 알려주는 이유를 버리지 않고 남겨서,
-- 사장님이 고칠 수 있는 문제(사진이 없다 등)는 바로 알 수 있게 한다.
alter table public.reports
  add column if not exists reel_error text default null;
