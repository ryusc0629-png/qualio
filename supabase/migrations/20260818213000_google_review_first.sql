-- 구글 리뷰 먼저 모으기 + 구글 비즈니스 프로필 점검
--
-- 왜: AI(ChatGPT·Gemini)가 "울산 사무실 청소 추천" 같은 짧은 질문에 답할 때는
-- 블로그가 아니라 구글 지도 데이터를 본다. 후보에 들어가려면 리뷰 5개·평점 4.5가
-- 최소 조건인데, 퀄리오 고객 32곳 중 31곳이 리뷰를 네이버로만 보내고 있어
-- AI가 읽는 곳(구글)이 통째로 비어 있었다.
--
-- 네이버를 버리자는 게 아니다. 구글 리뷰 5개를 채울 때까지만 구글로 보내고,
-- 채우면 원래 채널로 자동 복귀한다.

-- 이 업체가 '구글 먼저' 모드인지. 기본 true — 어차피 구글 링크가 없으면 동작하지 않는다.
alter table public.businesses
  add column if not exists review_google_first boolean not null default true;

-- 구글 비즈니스 프로필 점검 결과(사장님이 직접 확인해 체크한 항목).
-- 구글 Places 키가 들어오면 자동 조회로 대체할 수 있게 형태를 자유롭게 둔다.
alter table public.businesses
  add column if not exists gbp_checklist jsonb;

-- 이 후기 요청을 어느 채널로 보냈는지. 구글 리뷰가 몇 개나 모였는지 세는 근거.
alter table public.review_claims
  add column if not exists platform text;

create index if not exists review_claims_biz_platform_idx
  on public.review_claims (business_id, platform);
