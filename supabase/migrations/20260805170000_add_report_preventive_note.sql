-- 작업 보고에 '미리 챙긴 것·지켜볼 것'(예방 케어) 필드 추가.
-- 문제가 생기기 전에 먼저 발견·조치한 내용을 방문마다 기록 → 고객 리포트에 담겨
-- "문제 생기기 전에 봐준다"는 신뢰(만족 엔진)를 만들고, 월간 리포트로 굴러간다.
alter table reports add column if not exists preventive_note text;
