-- 정기계약의 방문 시간(KST "HH:mm"). 비어 있으면 기존처럼 오전 9시로 방문을 깐다.
-- 사장님이 예약 상세에서 "이 정기계약 전체 시간 변경"을 하면 여기에 저장돼,
-- 이후 자동 생성되는 방문도 이 시간으로 깔린다.
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS visit_time TEXT;

COMMENT ON COLUMN public.contracts.visit_time IS '정기 방문 기본 시각 (KST, "HH:mm"). NULL이면 09:00으로 생성';
