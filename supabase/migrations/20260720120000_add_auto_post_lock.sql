-- 자동/직접 발행 중복 방지용 락 컬럼
-- 직접 발행 버튼을 딜레이 중 두 번 눌러 같은 날 글이 중복 생성되던 문제 방지.
-- publishTodayAction에서 원자적 조건부 UPDATE로 락을 잡고(만료 3분), 끝나면 해제한다.
alter table public.businesses
  add column if not exists auto_post_lock_until timestamptz;
