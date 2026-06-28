-- 견적 퍼널 이벤트에 meta(jsonb) 추가 — 행동별 부가정보 저장
--
-- 왜 필요한가:
--   견적서 뒷 절반(열람→플랜 선택→예약)까지 추적을 확장하면서,
--   "어떤 플랜을 골랐는지(tier)", "얼마짜리 예약인지(price)" 같은
--   행동의 맥락을 함께 남겨야 성과 분석(플랜 선호도 등)이 가능하다.
--
-- 확장되는 event_type:
--   기존 form_started / step_completed / quote_submitted 에 더해
--   'quote_viewed'(견적서 열람) | 'plan_selected'(플랜 선택, meta.tier)
--   | 'address_entered'(주소 입력) | 'booking_submitted'(예약 확정, meta.tier/price)

alter table quote_funnel_events
  add column if not exists meta jsonb not null default '{}'::jsonb;
