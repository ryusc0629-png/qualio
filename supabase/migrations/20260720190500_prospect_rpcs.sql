-- 지역+업종 자동 명단용 RPC (프로덕션엔 MCP로 선적용됨, 재현성 위해 파일로 보관)

-- 시도별 시군구 목록 + 건수 (드롭다운)
create or replace function public.prospect_sigungu_list(p_sido text)
returns table(sigungu text, cnt bigint)
language sql stable as $$
  select sigungu, count(*)::bigint as cnt
  from public.prospects_directory
  where sido = p_sido and sigungu is not null and sigungu <> ''
  group by sigungu
  order by sigungu;
$$;

-- 적재된 시도 목록 (데이터 있는 지역만 노출)
create or replace function public.prospect_sido_list()
returns table(sido text, cnt bigint)
language sql stable as $$
  select sido, count(*)::bigint as cnt
  from public.prospects_directory
  where sido is not null and sido <> ''
  group by sido
  order by sido;
$$;

-- 지역+업종(키워드) 검색 → 방문 대상. 파라미터 바인딩이라 인젝션 안전.
create or replace function public.prospect_search(
  p_sido text,
  p_sigungu text,
  p_keyword text default null,
  p_limit int default 400
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
    and sigungu = p_sigungu
    and lat is not null and lng is not null
    and (
      p_keyword is null or p_keyword = ''
      or name ilike '%' || p_keyword || '%'
      or cat_sub ilike '%' || p_keyword || '%'
      or cat_mid ilike '%' || p_keyword || '%'
    )
  limit greatest(1, least(p_limit, 400));
$$;
