-- ============================================================
-- quotes 테이블에 고객 연락처 컬럼 추가
-- 공개 견적 폼에서 고객명과 전화번호를 수집하기 위함
-- ============================================================

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_phone text;


-- ============================================================
-- service_items.unit 제약 확장
-- 기존: '회', '㎡', '시간', '개'
-- 변경: '정액', '평당', '시간', '개' (업계 표준 반영)
-- ============================================================

ALTER TABLE public.service_items DROP CONSTRAINT IF EXISTS service_items_unit_check;

ALTER TABLE public.service_items
  ADD CONSTRAINT service_items_unit_check
  CHECK (unit IN ('정액', '평당', '시간', '개'));

-- 기본값도 변경
ALTER TABLE public.service_items ALTER COLUMN unit SET DEFAULT '정액';
