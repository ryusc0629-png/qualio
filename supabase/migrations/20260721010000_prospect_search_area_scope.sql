-- prospect_search 확장: 시군구를 '전체(시도)' 또는 '시 단위 prefix'로도 검색 (프로덕션 MCP 선적용)
-- p_sigungu: null/'' → 시도 전체 / '창원시' → 창원시 모든 구 / '창원시 의창구' → 해당 구
-- 상한도 400 → 1500 (시 전체/시도 전체를 한 번에)
create or replace function public.prospect_search(
  p_sido text,
  p_sigungu text,
  p_keyword text default null,
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
    and lat is not null and lng is not null
    and (
      p_keyword is null or p_keyword = ''
      or name ilike '%' || p_keyword || '%'
      or cat_sub ilike '%' || p_keyword || '%'
      or cat_mid ilike '%' || p_keyword || '%'
    )
  limit greatest(1, least(p_limit, 1500));
$$;
