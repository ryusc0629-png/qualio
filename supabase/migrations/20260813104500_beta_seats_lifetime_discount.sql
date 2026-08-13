-- 베타 100팀 평생 할인 근거를 DB에 남긴다.
-- 왜 필요한가: "선착순 100팀 평생 50% 할인"을 광고로 내보내면, 나중에 결제를 켤 때
-- 누가 그 100팀인지·할인율이 얼마인지 시스템이 알고 있어야 한다. 손으로 관리하면 반드시 어긋난다.
-- beta_number = 가입 순번(1부터), lifetime_discount_rate = 평생 할인율(%) — 결제 금액 계산에 그대로 쓰인다.
alter table public.businesses
  add column if not exists beta_number integer,
  add column if not exists lifetime_discount_rate integer not null default 0;

-- 순번은 중복되면 안 된다(같은 번호를 두 곳에 약속하는 사고 방지)
create unique index if not exists businesses_beta_number_key
  on public.businesses (beta_number)
  where beta_number is not null;

-- 이미 가입한 업체에 가입 순으로 소급 부여 (정원 100팀까지)
with ranked as (
  select id, row_number() over (order by created_at, id) as rn
  from public.businesses
  where beta_number is null
)
update public.businesses b
   set beta_number = r.rn,
       lifetime_discount_rate = 50
  from ranked r
 where b.id = r.id
   and r.rn <= 100;

-- 순번 채번 — 동시에 두 곳이 가입해도 같은 번호가 나가지 않도록 자문 잠금(advisory lock)으로 직렬화한다.
-- 정원(p_cap)·할인율(p_rate)은 코드(lib/config/beta.ts)에서 넘긴다 — 기준값이 두 곳에 흩어지지 않게.
-- 반환값: 부여된 순번 / 정원이 찼으면 null.
create or replace function public.assign_beta_number(
  p_business_id uuid,
  p_cap integer,
  p_rate integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing integer;
  v_next integer;
begin
  select beta_number into v_existing from public.businesses where id = p_business_id;
  if v_existing is not null then
    return v_existing; -- 이미 받은 번호는 절대 바뀌지 않는다
  end if;

  perform pg_advisory_xact_lock(hashtext('qualio_beta_number'));

  select coalesce(max(beta_number), 0) + 1 into v_next from public.businesses;
  if v_next > p_cap then
    return null; -- 베타 정원 마감
  end if;

  update public.businesses
     set beta_number = v_next,
         lifetime_discount_rate = p_rate
   where id = p_business_id;

  return v_next;
end;
$$;

-- anon(브라우저 키)으로는 호출할 수 없게 한다 — 번호 부여는 서버(service_role)에서만.
revoke all on function public.assign_beta_number(uuid, integer, integer) from public, anon, authenticated;
