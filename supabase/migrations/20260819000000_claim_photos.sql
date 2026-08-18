-- 요청(클레임)에 사진을 붙인다 — 접수 사진과 처리 후 사진.
--
-- 왜 필요한가:
-- 거래처 월간 보고서의 '요청 · 처리 내역'이 글만 있어서, 담당자가 어디를 말하는지
-- 사진 없이 문장으로만 짐작해야 했다. 위치와 상태는 사진 한 장이 문단 셋보다 빠르다.
-- 처리 사진까지 함께 두면 '요청 → 처리'가 눈으로 확인된다.

alter table public.claims
  add column if not exists photo_urls text[] not null default '{}',
  add column if not exists resolution_photo_urls text[] not null default '{}';

comment on column public.claims.photo_urls is
  '요청 접수 시 찍은 사진 — 어디가 문제인지 보여준다. 월간 보고서에 그대로 실린다.';
comment on column public.claims.resolution_photo_urls is
  '처리 후 사진 — 요청이 실제로 해결됐음을 보여준다.';
