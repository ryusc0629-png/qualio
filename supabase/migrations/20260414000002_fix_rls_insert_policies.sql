-- ============================================================
-- 수정: 전 테이블 RLS INSERT 정책 재구성
--
-- 문제: FOR ALL + USING 정책은 INSERT 시 USING 절을 WITH CHECK 로 사용.
--       온보딩 시점에 business_id 가 아직 없으므로 get_my_business_id() = NULL
--       → INSERT 전체 차단.
--
-- 해결: INSERT 는 별도 정책으로 분리하여 적절한 WITH CHECK 조건 사용.
-- ============================================================


-- ============================================================
-- businesses 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체만 접근" ON public.businesses;

CREATE POLICY "소속 사업체 조회"
  ON public.businesses FOR SELECT
  USING (id = get_my_business_id());

CREATE POLICY "소속 사업체 수정"
  ON public.businesses FOR UPDATE
  USING (id = get_my_business_id())
  WITH CHECK (id = get_my_business_id());

-- 신규 업체 생성: 본인이 owner 인 경우만 허용
CREATE POLICY "업체 생성 허용"
  ON public.businesses FOR INSERT
  WITH CHECK (owner_id = auth.uid());


-- ============================================================
-- subscriptions 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체 데이터만 접근" ON public.subscriptions;

CREATE POLICY "소속 사업체 구독 조회"
  ON public.subscriptions FOR SELECT
  USING (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 구독 수정"
  ON public.subscriptions FOR UPDATE
  USING (business_id = get_my_business_id())
  WITH CHECK (business_id = get_my_business_id());

-- 구독 생성: 본인 소유 업체에만 허용
CREATE POLICY "구독 생성 허용"
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );


-- ============================================================
-- service_items 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체 데이터만 접근" ON public.service_items;

CREATE POLICY "소속 사업체 서비스 조회"
  ON public.service_items FOR SELECT
  USING (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 서비스 수정"
  ON public.service_items FOR UPDATE
  USING (business_id = get_my_business_id())
  WITH CHECK (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 서비스 삭제"
  ON public.service_items FOR DELETE
  USING (business_id = get_my_business_id());

CREATE POLICY "서비스 항목 생성 허용"
  ON public.service_items FOR INSERT
  WITH CHECK (business_id = get_my_business_id());


-- ============================================================
-- quote_tiers 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체 데이터만 접근" ON public.quote_tiers;

CREATE POLICY "소속 사업체 견적 단계 조회"
  ON public.quote_tiers FOR SELECT
  USING (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 견적 단계 수정"
  ON public.quote_tiers FOR UPDATE
  USING (business_id = get_my_business_id())
  WITH CHECK (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 견적 단계 삭제"
  ON public.quote_tiers FOR DELETE
  USING (business_id = get_my_business_id());

CREATE POLICY "견적 단계 생성 허용"
  ON public.quote_tiers FOR INSERT
  WITH CHECK (business_id = get_my_business_id());


-- ============================================================
-- surcharge_rules 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체 데이터만 접근" ON public.surcharge_rules;

CREATE POLICY "소속 사업체 추가요금 조회"
  ON public.surcharge_rules FOR SELECT
  USING (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 추가요금 수정"
  ON public.surcharge_rules FOR UPDATE
  USING (business_id = get_my_business_id())
  WITH CHECK (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 추가요금 삭제"
  ON public.surcharge_rules FOR DELETE
  USING (business_id = get_my_business_id());

CREATE POLICY "추가요금 규칙 생성 허용"
  ON public.surcharge_rules FOR INSERT
  WITH CHECK (business_id = get_my_business_id());


-- ============================================================
-- quotes 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체 데이터만 접근" ON public.quotes;

CREATE POLICY "소속 사업체 견적 조회"
  ON public.quotes FOR SELECT
  USING (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 견적 수정"
  ON public.quotes FOR UPDATE
  USING (business_id = get_my_business_id())
  WITH CHECK (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 견적 삭제"
  ON public.quotes FOR DELETE
  USING (business_id = get_my_business_id());

CREATE POLICY "견적 생성 허용"
  ON public.quotes FOR INSERT
  WITH CHECK (business_id = get_my_business_id());


-- ============================================================
-- bookings 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체 데이터만 접근" ON public.bookings;

CREATE POLICY "소속 사업체 예약 조회"
  ON public.bookings FOR SELECT
  USING (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 예약 수정"
  ON public.bookings FOR UPDATE
  USING (business_id = get_my_business_id())
  WITH CHECK (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 예약 삭제"
  ON public.bookings FOR DELETE
  USING (business_id = get_my_business_id());

CREATE POLICY "예약 생성 허용"
  ON public.bookings FOR INSERT
  WITH CHECK (business_id = get_my_business_id());


-- ============================================================
-- reports 테이블
-- ============================================================
DROP POLICY IF EXISTS "소속 사업체 데이터만 접근" ON public.reports;

CREATE POLICY "소속 사업체 리포트 조회"
  ON public.reports FOR SELECT
  USING (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 리포트 수정"
  ON public.reports FOR UPDATE
  USING (business_id = get_my_business_id())
  WITH CHECK (business_id = get_my_business_id());

CREATE POLICY "소속 사업체 리포트 삭제"
  ON public.reports FOR DELETE
  USING (business_id = get_my_business_id());

CREATE POLICY "리포트 생성 허용"
  ON public.reports FOR INSERT
  WITH CHECK (business_id = get_my_business_id());
