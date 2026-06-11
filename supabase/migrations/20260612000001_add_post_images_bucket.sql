-- ============================================================
-- post-images 스토리지 버킷 생성
-- 마케팅 포스트 대표 이미지 저장용
-- ============================================================

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- 인증된 사용자 업로드 허용
create policy "post_images_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-images');

-- 누구나 읽기 허용 (공개 랜딩 페이지 표시용)
create policy "post_images_select"
  on storage.objects for select
  to public
  using (bucket_id = 'post-images');

-- 본인 파일만 삭제 허용
create policy "post_images_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
