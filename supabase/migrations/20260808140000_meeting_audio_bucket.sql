-- 미팅 녹음 오디오 임시 저장 버킷
-- 녹음 파일(수 MB~십수 MB)은 Vercel 서버리스 요청 한도(4.5MB)를 넘어 서버로 못 보낸다.
-- 그래서 브라우저에서 Storage로 직접 올리고(Vercel 우회), 서버는 경로만 받아 내려받아
-- 받아쓰기한 뒤 즉시 삭제한다. 저장이 목적이 아니라 '용량 한도 우회'가 목적이므로 비공개(private).

insert into storage.buckets (id, name, public)
values ('meeting-audio', 'meeting-audio', false)
on conflict (id) do nothing;

-- 로그인 사용자 업로드 허용 (미팅 녹음은 대시보드=인증 상태에서 진행)
create policy "meeting_audio_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'meeting-audio');

-- 익명 세션도 허용 (모바일 세션 유실 등 엣지 케이스에서도 업로드가 막히지 않도록)
create policy "meeting_audio_insert_anon"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'meeting-audio');

-- 읽기/삭제는 정책을 두지 않는다 → service_role(서버)만 접근. 오디오는 처리 즉시 서버가 삭제한다.
