-- 지역 GEO 최적화: 추가 출장 지역(사장님이 직접 더하는 넓은 권역) + 인스타그램 채널
-- service_areas: 주소에서 자동 추출하는 "지역 사다리"에 더해, 실제로 더 멀리 출장 가는
--                지역을 사장님이 직접 넣는 목록 (예: 수원, 안산). areaServed/콘텐츠에 반영.
-- instagram_url: 업체 SNS 엔티티 통합(sameAs) + 페이지 하단 채널 노출용.

alter table businesses
  add column if not exists service_areas text[] not null default '{}',
  add column if not exists instagram_url text;

comment on column businesses.service_areas is '추가 출장 지역(주소 사다리 외에 사장님이 직접 더하는 넓은 지역명)';
comment on column businesses.instagram_url is '인스타그램 프로필 URL (sameAs · 하단 채널 노출)';
