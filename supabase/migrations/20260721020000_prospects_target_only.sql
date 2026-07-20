-- 타겟 업종만 저장하는 구조로 전환(전체 상가 X → 인테리어·병의원·학원·공장만)
-- 자유검색 폐기 → 고정 선택. 트라이그램 인덱스 제거로 디스크 대폭 절감.

alter table public.prospects_directory add column if not exists target text;

-- 자유검색용 트라이그램 인덱스 제거(더 이상 안 씀)
drop index if exists public.prospects_name_trgm_idx;

-- 지역+타겟 조회 인덱스
create index if not exists prospects_target_region_idx
  on public.prospects_directory (target, sido, sigungu);

-- 검색 RPC를 '타겟 정확일치'로 교체(키워드 ilike 폐기). 파라미터명이 바뀌어 drop 후 재생성.
drop function if exists public.prospect_search(text, text, text, int);
create function public.prospect_search(
  p_sido text,
  p_sigungu text,
  p_target text,
  p_limit int default 1500
)
returns table(name text, address text, lat double precision, lng double precision)
language sql stable as $$
  select
    name,
    coalesce(nullif(addr_road, ''), addr_jibun) as address,
    lat,
    lng
  from public.prospects_directory
  where sido = p_sido
    and (p_sigungu is null or p_sigungu = '' or sigungu ilike p_sigungu || '%')
    and target = p_target
    and lat is not null and lng is not null
  limit greatest(1, least(p_limit, 1500));
$$;
