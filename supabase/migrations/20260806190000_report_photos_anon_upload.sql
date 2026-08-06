-- 현장앱(직원용 /field/[workerId] 링크)은 로그인 없이 접속하는 익명(anon) 세션이다.
-- 기존 report_photos_insert 정책은 authenticated만 허용해, 직원이 현장에서 사진(작업 전/후·
-- 문단속 오픈/마감)을 올리면 스토리지 업로드가 막혔다. report-photos 버킷은 이미 공개(공개 읽기)이며
-- 현장앱 업로드가 정상 동작하도록 anon에게도 INSERT/UPDATE(upsert)를 허용한다.

CREATE POLICY "report_photos_insert_anon" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'report-photos');

CREATE POLICY "report_photos_update_anon" ON storage.objects
  FOR UPDATE TO anon
  USING (bucket_id = 'report-photos')
  WITH CHECK (bucket_id = 'report-photos');
