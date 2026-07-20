-- 영업 동선 '지역+업종 자동 명단'용 공유 참조 데이터
-- 출처: 소상공인시장진흥공단 상가(상권)정보 (공공데이터포털, 이용허락범위 제한 없음=상업적 이용 가능, 출처표시)
-- 업체 소유가 아닌 전사 공유 데이터라 business_id 없음. service_role로만 읽고, 일반 사용자 직접 접근 차단.

create table if not exists public.prospects_directory (
  id            bigint generated always as identity primary key,
  store_id      text unique,            -- 상가업소번호 (분기 갱신 시 upsert 키)
  name          text not null,          -- 상호명
  branch        text,                   -- 지점명
  cat_major     text,                   -- 상권업종 대분류명
  cat_mid       text,                   -- 상권업종 중분류명
  cat_sub       text,                   -- 상권업종 소분류명
  sido          text,                   -- 시도명
  sigungu       text,                   -- 시군구명
  dong          text,                   -- 행정동명
  addr_jibun    text,                   -- 지번주소
  addr_road     text,                   -- 도로명주소
  building      text,                   -- 건물명
  lat           double precision,       -- 위도
  lng           double precision,       -- 경도
  updated_at    timestamptz not null default now()
);

-- 지역+업종 필터 조회용 인덱스
create index if not exists prospects_region_cat_idx
  on public.prospects_directory (sido, sigungu, cat_sub);
create index if not exists prospects_region_major_idx
  on public.prospects_directory (sido, sigungu, cat_major);
-- 상호명 부분검색(예: '인테리어')용 트라이그램 인덱스
create extension if not exists pg_trgm;
create index if not exists prospects_name_trgm_idx
  on public.prospects_directory using gin (name gin_trgm_ops);

-- RLS: 활성화하되 정책 없음 → service_role(createServiceClient)만 접근, 클라이언트 직접 접근 차단
alter table public.prospects_directory enable row level security;
