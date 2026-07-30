-- 리드→고객 전환 후에도 견적서(시방서·계약서)가 리드 삭제로 사라지지 않도록
-- b2b_quotes.lead_id 외래키를 ON DELETE CASCADE → ON DELETE SET NULL 로 변경.
--
-- 배경: 전환된 견적서는 lead_id(옛 리드)와 customer_id(고객)를 둘 다 가짐.
-- 기존엔 lead_id가 CASCADE라, 사장님이 옛 리드를 정리 삭제하면 살아있는 고객의
-- 계약서·시방서까지 연쇄 삭제됐음. SET NULL 로 바꾸면 리드를 지워도 lead_id만
-- 비워지고 문서는 customer_id로 고객에 그대로 남는다.
alter table b2b_quotes drop constraint if exists b2b_quotes_lead_id_fkey;
alter table b2b_quotes
  add constraint b2b_quotes_lead_id_fkey
  foreign key (lead_id) references leads(id) on delete set null;
