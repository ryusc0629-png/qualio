-- 서비스 항목에 '규모 구간별 단가' 추가
--
-- 왜 필요한가:
--   지금은 평당 단가 하나뿐이라 250평 견적이 25,000 × 250 = 6,250,000원으로 곧이곧대로 나온다.
--   실제 청소 견적은 규모가 커질수록 평당 단가가 내려가므로, 큰 건일수록 금액이 비현실적으로 커진다.
--   구간을 업체가 직접 넣게 해서(우리가 숫자를 정하지 않는다) 대형 문의도 바로 쓸 수 있는 금액이 나오게 한다.
--
-- 형식: [{"min_size": 100, "price": 22000}, {"min_size": 300, "price": 19000}]
--   min_size = 이 평수(또는 개수)부터, price = 그 구간의 평당(개당) 단가
--   적용 방식은 '전체 적용' — 250평이면 100평 구간 단가 × 250평 (누진 아님)
--   비어 있으면 기존처럼 base_price 하나만 쓴다(기존 서비스는 손대지 않아도 그대로 동작)
alter table public.service_items
  add column if not exists volume_tiers jsonb;

comment on column public.service_items.volume_tiers is
  '규모 구간별 단가 [{min_size, price}]. min_size 이상일 때 그 구간 단가를 평당/개당 단가로 사용(전체 적용)';
