-- 견적 테스트/장난 표시 — 통계 오염 방지
--
-- 왜 필요한가:
--   마케팅 대시보드의 "견적 신청 수·전환율"은 상태(취소·보관 포함)와 무관하게 quotes를
--   전부 센다. 그래서 사장님이 직접 테스트로 남긴 견적이나, 고객사가 호기심에 눌러본
--   장난 견적까지 숫자에 섞여 통계가 오염된다.
--
--   is_test=true인 견적은 마케팅 통계와 '예약확정 대기' 목록에서 제외한다.
--   ① 자동: 견적 전화번호 = 업체 대표 번호면 본인 테스트로 보고 생성 시 자동 true
--   ② 수동: 대시보드에서 "테스트" 버튼으로 표시(가짜 번호로 남긴 장난 견적 대비)

alter table quotes add column if not exists is_test boolean not null default false;

-- 백필: 기존 견적 중 전화번호(숫자만)가 업체 대표 전화와 같은 것은 본인 테스트로 표시
update quotes q
set is_test = true
from businesses b
where q.business_id = b.id
  and b.phone is not null
  and regexp_replace(coalesce(q.customer_phone, ''), '[^0-9]', '', 'g') <> ''
  and regexp_replace(q.customer_phone, '[^0-9]', '', 'g') = regexp_replace(b.phone, '[^0-9]', '', 'g');

create index if not exists idx_quotes_is_test on quotes(business_id, is_test);
