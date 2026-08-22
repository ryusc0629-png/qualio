-- 도급사 상호를 이름과 분리해서 보관한다.
--
-- 지금까지는 workers.name 한 칸에 상호와 사람 이름이 같이 들어갔다
-- ('리멤버클린 김성현 팀장님'). 그 값이 고객에게 나가는 문구에 그대로 실려
-- 2026-08-22에 하청 사실이 노출됐다.
--
-- 상호는 우리끼리 구분하는 값(정산·도급 계약서), 이름은 고객에게 나가는 값이다.
-- 칸을 나눠 두면 애초에 섞일 일이 없다(사장님 제안 2026-08-22).
--
-- 직원(type='employee')은 상호가 없으므로 비워 둔다.
-- workers는 이미 만들어진 테이블이라 RLS는 그대로 켜져 있다(칸만 추가).
alter table public.workers add column if not exists company_name text;

comment on column public.workers.company_name is
  '도급사 상호 — 내부 구분·정산·도급 계약서용. 고객에게 나가는 문구에는 절대 쓰지 않는다';

-- 이미 한 칸에 붙여 적어둔 값을 갈라 놓는다.
--
-- 한국어 표기 관행상 상호가 앞, 사람이 뒤에 온다('리멤버클린 김성현 팀장님').
-- ⚠️세 덩어리 이상일 때만 가른다. '홍길동 팀장'처럼 두 덩어리는 앞이 사람 이름이라
--   가르면 상호가 '홍길동'이 되고 이름이 '팀장'만 남는다. 애매하면 건드리지 않는다.
-- 잘못 갈라져도 화면(일정 → 담당자 → 연필)에서 바로 고칠 수 있고,
-- 고객 문구는 이름 칸을 한 번 더 거르므로 상호가 새지 않는다.
update public.workers
set
  company_name = split_part(btrim(name), ' ', 1),
  name         = substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 2)
where type = 'contractor'
  and company_name is null
  and array_length(string_to_array(btrim(name), ' '), 1) >= 3;
