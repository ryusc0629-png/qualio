-- ============================================================
-- report-photos 스토리지 버킷 생성
-- 작업 완료 보고서용 before/after 사진 저장
-- ============================================================

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

-- 인증된 사용자(업체 직원) 업로드 허용
create policy "report_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'report-photos');

-- 누구나 읽기 허용 (고객이 보고서 링크에서 조회)
create policy "report_photos_select"
  on storage.objects for select
  to public
  using (bucket_id = 'report-photos');

-- 인증된 사용자 삭제 허용
create policy "report_photos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'report-photos');
