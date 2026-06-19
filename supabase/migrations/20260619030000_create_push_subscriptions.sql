-- 웹 푸시(앱 알림) 구독 정보 — 대표가 알림 켠 기기별로 저장
-- 한 업체(대표)가 여러 기기(폰/노트북)에서 알림을 받을 수 있으므로 endpoint 단위로 저장한다.
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid references profiles(id) on delete cascade,
  endpoint    text not null unique,        -- 브라우저 푸시 엔드포인트 (기기 식별)
  p256dh      text not null,               -- 구독 공개키
  auth        text not null,               -- 구독 인증 시크릿
  user_agent  text,                        -- 어떤 기기/브라우저인지 (관리용)
  created_at  timestamptz not null default now()
);

-- 업체별 구독 조회용 인덱스
create index if not exists push_subscriptions_business_id_idx
  on push_subscriptions (business_id);
