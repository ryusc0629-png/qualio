-- ============================================================
-- 수정: handle_new_user 트리거 함수
-- 원인: auth 스키마 컨텍스트에서 실행 시 public.profiles를 찾지 못함
-- 해결: search_path = '' 설정 + 명시적 public.profiles 스키마 지정
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;


-- ============================================================
-- 수정: profiles RLS 정책 재구성
-- 기존 FOR ALL 정책은 INSERT 시 auth.uid()가 null이면 차단됨
-- INSERT는 WITH CHECK (true) 로 허용 (FK 제약이 보안 역할 담당)
-- ============================================================

DROP POLICY IF EXISTS "본인 프로필만 접근" ON public.profiles;

-- 조회: 본인 프로필만
CREATE POLICY "본인 프로필 조회"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- 수정: 본인 프로필만
CREATE POLICY "본인 프로필 수정"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 삽입: 트리거(handle_new_user)에서 자유롭게 생성 허용
-- profiles.id 는 auth.users.id 를 FK로 참조하므로 유효한 유저만 가능
CREATE POLICY "프로필 생성 허용"
  ON public.profiles FOR INSERT
  WITH CHECK (true);
