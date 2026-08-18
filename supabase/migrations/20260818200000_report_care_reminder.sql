-- 보고서에 '앞으로 손봐야 할 것'과 그 시점을 적어두고, 때가 되면 사장님에게 알린다.
--
-- 왜 필요한가:
-- 작업 보고서에 '추천 서비스 + 가격 + 견적 문의' 배너를 붙여뒀는데, 거래처에 보내는
-- 서류에 판촉이 박혀 있으면 문서의 격이 떨어지고 영업으로만 읽힌다.
-- 대신 "이 부분이 이랬고, 6개월쯤 뒤에는 이렇게 될 수 있다"를 적어두고,
-- 실제로 그 시점이 오면 사장님에게 알려 다시 연락하게 한다.
-- 같은 재방문 유도라도 '영업'이 아니라 '관리'로 읽히고, 근거가 그 현장 기록이라 설득력이 다르다.

alter table public.reports
  add column if not exists care_advice text,
  add column if not exists care_due_at timestamptz,
  add column if not exists care_notified_at timestamptz;

comment on column public.reports.care_advice is
  '앞으로 손봐야 할 것 — 고객 보고서에 그대로 실린다. 예: 바닥 왁스가 벗겨지고 있어 6개월쯤 뒤 재코팅이 필요합니다.';
comment on column public.reports.care_due_at is
  '위 안내대로 다시 연락할 시점. 이 날이 지나면 사장님에게 알린다.';
comment on column public.reports.care_notified_at is
  '사장님에게 알린 시각. 같은 건으로 매일 알리지 않기 위한 기록.';

-- 크론이 '기한 지났고 아직 안 알린 것'만 훑도록
create index if not exists reports_care_due_idx
  on public.reports (care_due_at)
  where care_due_at is not null and care_notified_at is null;
