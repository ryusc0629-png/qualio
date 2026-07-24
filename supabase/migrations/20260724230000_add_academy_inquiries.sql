-- 기술 창업 학원 제휴 문의 저장 — 공개 랜딩(/academy)에서 학원 리드 확보용
--
-- 왜 필요한가:
--   청소 창업 카페의 "기술 창업 학원 제휴 문의" 링크를, 퀄리오 메인홈이 아니라
--   학원 전용 랜딩(/academy)으로 연결한다. 학원 원장/담당자가 제휴 관심을 남기면
--   여기에 쌓이고, 대표는 리드를 필터링해 진짜 학원만 미팅으로 이어간다.
--
-- 제휴 조건(수수료·커리큘럼 상세)은 공개 페이지에 노출하지 않는다. 리드만 받고
--   조건은 미팅에서 학원별로 협의한다(협상력·채널 경제학 보호). 그래서 이 테이블은
--   '관심 표명 + 자격 검증 항목'만 담는다.
--
-- 접근: 공개 페이지에서 인증 없이 기록되므로 service_role 전용. RLS 잠금.

create table if not exists academy_inquiries (
  id             uuid        primary key default gen_random_uuid(),
  academy_name   text        not null,                 -- 학원명
  contact_name   text        not null,                 -- 원장/담당자명
  phone          text        not null,                 -- 숫자만 저장(하이픈 제거)
  region         text,                                 -- 지역(시/도·시군구)
  program_type   text,                                 -- 'cleaning'(청소·방역 관련) | 'other_tech'(기타 기술) | 'preparing'(신설 준비)
  student_scale  text,                                 -- 'small'(1~10) | 'medium'(11~30) | 'large'(30+) : 기수당 수강생 규모
  message        text,                                 -- 문의 내용(선택)
  source         text,                                 -- 유입 경로(추후 utm/referrer용, 현재 미사용)
  contacted      boolean     not null default false,   -- 연락/미팅 완료 여부(운영자 관리용)
  created_at     timestamptz not null default now()
);

-- 같은 번호 중복 문의 방지(신규/갱신 분기용)
create unique index if not exists uniq_academy_inquiries_phone   on academy_inquiries(phone);
create index        if not exists idx_academy_inquiries_created  on academy_inquiries(created_at desc);
create index        if not exists idx_academy_inquiries_program  on academy_inquiries(program_type);

alter table academy_inquiries enable row level security;
