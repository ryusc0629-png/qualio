-- 가입 경로 추적: 신규 업체가 퀄리오를 "어떻게 알게 됐는지" 기록
-- 목적: 오가닉 유입이 어느 채널에서 오는지 데이터화 → 홍보(직접) vs 챌린지(콘텐츠) 비중 판단 근거
--   acquisition_source   : 자가응답 채널 코드 (youtube/search/referral/sns/community/etc)
--   acquisition_detail   : '기타' 선택 시 직접 입력한 텍스트
--   acquisition_referrer : 가입 시 document.referrer (best-effort, 비어있을 수 있음)
--   acquisition_utm      : 가입 시 URL의 utm 파라미터 (best-effort, 링크 태깅 시에만 채워짐)
alter table businesses
  add column if not exists acquisition_source   text,
  add column if not exists acquisition_detail   text,
  add column if not exists acquisition_referrer text,
  add column if not exists acquisition_utm      text;
