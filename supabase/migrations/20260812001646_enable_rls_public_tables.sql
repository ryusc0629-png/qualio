-- RLS 누락 테이블 7종 잠금 (Supabase 보안 경고 rls_disabled_in_public 대응)
--
-- 왜 필요한가: public 스키마 테이블은 PostgREST로 노출되고 anon 키는 브라우저에 그대로 실린다.
-- RLS가 꺼져 있으면 anon 키만 있으면 누구나 읽기/수정/삭제가 가능하다.
--
-- 정책을 따로 만들지 않는 이유: 이 앱의 모든 DB 접근은 서버에서 createServiceClient(service_role)로
-- 이뤄지고 service_role은 RLS를 우회한다. 즉 RLS만 켜면 외부(anon/authenticated) 접근만 막히고
-- 앱 동작에는 영향이 없다. (브라우저 supabase 클라이언트는 Storage 업로드에만 쓰고 있음 — 확인 완료)

alter table public.quote_tier_services enable row level security;
alter table public.page_views          enable row level security;
alter table public.geo_questions       enable row level security;
alter table public.geo_checks          enable row level security;
alter table public.rate_limits         enable row level security;
alter table public.onboarding_reports  enable row level security;
alter table public.bug_reports         enable row level security;

-- 아래 8개는 이미 DB에 RLS가 켜져 있으나 마이그레이션 파일에 기록이 없던 것들.
-- (대시보드에서 직접 켠 흔적) 재실행해도 아무 일 없는 구문이라, 파일과 실제 상태를 일치시켜
-- scripts/check-rls.mjs 정적 검사가 예외 없이 통과하도록 여기에 명시해 둔다.
alter table public.b2b_quotes            enable row level security;
alter table public.biz_posts             enable row level security;
alter table public.booking_items         enable row level security;
alter table public.booking_price_changes enable row level security;
alter table public.lead_activities       enable row level security;
alter table public.post_views            enable row level security;
alter table public.push_subscriptions    enable row level security;
alter table public.review_claims         enable row level security;
