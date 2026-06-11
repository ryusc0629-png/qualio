-- service_items 테이블에 사진 URL 배열 컬럼 추가
ALTER TABLE public.service_items
  ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';

-- service-photos 스토리지 버킷 생성 (견적 랜딩 페이지 표시용)
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 인증된 사용자 업로드 허용
CREATE POLICY "service_photos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'service-photos');

-- 누구나 읽기 허용 (공개 견적 랜딩 페이지 표시용)
CREATE POLICY "service_photos_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'service-photos');

-- 본인 파일만 삭제 허용
CREATE POLICY "service_photos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'service-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
