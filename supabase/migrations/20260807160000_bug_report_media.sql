-- 오류 신고에 이미지·영상 첨부
-- 비테크 사장님이 "이게 안 돼요"를 글로 설명하기 어려우므로 화면 캡처·녹화를 붙일 수 있게 한다.
-- 영상은 크기가 커서 Vercel 서버(4.5MB 제한)를 거치지 않고 브라우저에서 Supabase 스토리지로 직접 업로드한다.

-- 첨부 미디어(이미지·영상)의 공개 URL 배열
alter table public.bug_reports add column if not exists media_urls text[];

-- 첨부 파일 저장용 버킷 (공개 읽기 — 관리자 화면에서 <img>/<video>로 표시)
insert into storage.buckets (id, name, public)
values ('bug-report-media', 'bug-report-media', true)
on conflict (id) do nothing;

-- 로그인 사용자 업로드 허용 (오류 신고 버튼은 대시보드=인증 상태)
create policy "bug_report_media_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'bug-report-media');

-- 익명 세션도 허용 (세션 유실 등 엣지 케이스에서도 첨부가 막히지 않도록)
create policy "bug_report_media_insert_anon"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'bug-report-media');

-- 누구나 읽기 (URL은 UUID라 추측 불가)
create policy "bug_report_media_select"
  on storage.objects for select
  to public
  using (bucket_id = 'bug-report-media');
