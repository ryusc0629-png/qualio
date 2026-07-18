-- 90일 챌린지 사전신청(대기명단) 저장 — 퀄리오 정식 오픈 전 관심 고객 확보용
--
-- 왜 필요한가:
--   "0에서 매출 만들기"를 실시간 공개하는 90일 챌린지를 보고 "나도 저렇게 자동화하고 싶다"는
--   사장님의 관심을, 결과가 나오기 전에 미리 잡아둔다. 결과가 좋을 때 1기로 가장 먼저 연락할 명단.
--
-- 결제 흐름과 완전히 분리된 공개 페이지(/challenge)에서만 기록된다.
--   → 결제망(토스/포트원) 심사 대상 페이지와 무관하므로 심사에 영향 없음.
--
-- 접근: 공개 페이지에서 인증 없이 기록되므로 service_role 전용. RLS 잠금.

create table if not exists pre_registrations (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,                 -- 이름 또는 상호
  phone        text        not null,                 -- 숫자만 저장(하이픈 제거)
  owner_status text        not null,                 -- 'operating'(운영 중) | 'preparing'(창업 준비 중)
  source       text,                                 -- 유입 경로(추후 utm/referrer용, 현재 미사용)
  contacted    boolean     not null default false,   -- 1기 연락 완료 여부(운영자 관리용)
  created_at   timestamptz not null default now()
);

-- 같은 번호 중복 신청 방지(신규/갱신 분기용)
create unique index if not exists uniq_pre_registrations_phone   on pre_registrations(phone);
create index        if not exists idx_pre_registrations_created  on pre_registrations(created_at desc);
create index        if not exists idx_pre_registrations_status   on pre_registrations(owner_status);

alter table pre_registrations enable row level security;
