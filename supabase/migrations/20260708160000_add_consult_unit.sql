-- 서비스 단위에 '상담'(현장 방문 후 견적) 추가
-- 정기청소처럼 현장을 봐야 견적이 나오는 서비스는 미리 단가를 정할 수 없음 → 상담 단위로 등록
ALTER TABLE public.service_items DROP CONSTRAINT IF EXISTS service_items_unit_check;
ALTER TABLE public.service_items
  ADD CONSTRAINT service_items_unit_check
  CHECK (unit IN ('정액', '평당', '시간', '개', '상담'));
