-- 오류 신고에 재현용 상황을 더 담는다.
-- 왜 필요한가: 지금은 화면 경로와 기기 정보만 있어서 "어느 배포에서 났는지", "폰이었는지 PC였는지"를
-- 다시 물어봐야 했다. 베타 100팀을 받으면 이 되묻기가 곧 시간이다.
alter table public.bug_reports
  add column if not exists viewport text,      -- 예: '390x844 (dpr 3)'
  add column if not exists app_version text;   -- 배포 커밋 앞 7자 — 어느 배포에서 났는지
