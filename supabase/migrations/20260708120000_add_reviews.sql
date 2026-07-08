-- 실제 고객 후기(별점+한 줄) 저장 — 자사 페이지 사회적 증거(social proof)용
--
-- 왜 필요한가:
--   지금은 고객을 네이버·구글로 '보내기만' 하고, 정작 그 별점/후기를 우리가 갖고 있지 않아
--   견적 페이지·브랜드 홈에 "⭐4.9 · 후기 37개" 같은 전환 지렛대를 못 보여줬다.
--   리뷰 인증 단계에서 별점+한 줄을 먼저 받아 여기에 저장한다.
--
-- 별점 분기(reputation routing):
--   rating >= 4 → is_public=true, routed_to='external' (네이버 등 공개 리뷰로도 유도)
--   rating <= 3 → is_public=false, routed_to='private' (비공개 피드백 + 대표에게 케어 알림)
--
-- 접근: 공개 페이지에서 기록(인증 없음)되므로 service_role 전용. RLS 잠금.

create table if not exists reviews (
  id            uuid        primary key default gen_random_uuid(),
  business_id   uuid        not null references businesses(id) on delete cascade,
  booking_id    uuid        references bookings(id) on delete set null,
  claim_id      uuid        references review_claims(id) on delete set null,
  customer_name text,                                  -- 표시용(마스킹은 렌더 시)
  rating        smallint    not null check (rating between 1 and 5),
  comment       text,                                  -- 한 줄 후기(선택)
  is_public     boolean     not null default true,     -- 공개 전시 여부(4~5점만 true)
  routed_to     text,                                  -- 'external' | 'private'
  created_at    timestamptz not null default now()
);

create index if not exists idx_reviews_business        on reviews(business_id);
create index if not exists idx_reviews_business_public on reviews(business_id, is_public, created_at desc);
-- 한 예약(클레임)당 후기 1건만 — 중복 저장 방지
create unique index if not exists uniq_reviews_claim   on reviews(claim_id) where claim_id is not null;

alter table reviews enable row level security;
